#![no_std]

use soroban_sdk::{contract, contractevent, contractimpl, contracttype, Address, BytesN, Env};

pub const USDC_SCALE: i128 = 10_000_000;
pub const MIN_PRICE: i128 = USDC_SCALE;

// Soroban TTL is measured in ledgers. These values keep the locker and its
// records alive for about 30 days, with a one-day renewal threshold.
pub const TTL_THRESHOLD: u32 = 17_280;
pub const TTL_EXTEND_TO: u32 = 518_400;

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum MealStatus {
    Waiting,
    Served,
    Returned,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Settings {
    pub admin: Address,
    pub usdc: Address,
    pub next_meal: u64,
    pub refund_seconds: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Stall {
    pub payout: Address,
    pub price: i128,
    pub active: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Meal {
    pub buyer: Address,
    pub stall_id: u32,
    pub payout: Address,
    pub amount: i128,
    pub fingerprint: BytesN<32>,
    pub backup_fingerprint: BytesN<32>,
    pub bought_at: u64,
    pub expires_at: u64,
    pub status: MealStatus,
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Settings,
    Stall(u32),
    Meal(u64),
}

#[contractevent(topics = ["bought"])]
pub struct BoughtEvent {
    #[topic]
    pub meal_id: u64,
    #[topic]
    pub stall_id: u32,
    #[topic]
    pub buyer: Address,
    pub amount: i128,
}

#[contractevent(topics = ["served"])]
pub struct ServedEvent {
    #[topic]
    pub meal_id: u64,
    #[topic]
    pub stall_id: u32,
    #[topic]
    pub payout: Address,
    pub amount: i128,
}

#[contractevent(topics = ["returned"])]
pub struct ReturnedEvent {
    #[topic]
    pub meal_id: u64,
    #[topic]
    pub buyer: Address,
    pub amount: i128,
}

#[contract]
pub struct PendienteLocker;

#[contractimpl]
impl PendienteLocker {
    pub fn init(env: Env, admin: Address, usdc: Address, refund_seconds: u64) {
        if env.storage().instance().has(&DataKey::Settings) {
            panic!("already initialized")
        }
        if refund_seconds == 0 {
            panic!("refund time must be positive")
        }
        admin.require_auth();
        env.storage().instance().set(
            &DataKey::Settings,
            &Settings {
                admin,
                usdc,
                next_meal: 1,
                refund_seconds,
            },
        );
        Self::touch_instance(&env);
    }

    pub fn add_stall(env: Env, stall_id: u32, payout: Address, price: i128, active: bool) {
        Self::touch_instance(&env);
        Self::require_admin(&env);
        Self::check_price(price);
        Self::write_stall(
            &env,
            stall_id,
            Stall {
                payout,
                price,
                active,
            },
        );
    }

    pub fn update_stall(env: Env, stall_id: u32, payout: Address, price: i128, active: bool) {
        Self::touch_instance(&env);
        Self::require_admin(&env);
        Self::check_price(price);
        if !env.storage().persistent().has(&DataKey::Stall(stall_id)) {
            panic!("stall not found")
        }
        Self::write_stall(
            &env,
            stall_id,
            Stall {
                payout,
                price,
                active,
            },
        );
    }

    pub fn buy(
        env: Env,
        buyer: Address,
        stall_id: u32,
        fingerprint: BytesN<32>,
        backup_fingerprint: BytesN<32>,
    ) -> u64 {
        Self::touch_instance(&env);
        buyer.require_auth();
        let stall = Self::stall(&env, stall_id);
        if !stall.active {
            panic!("stall paused")
        }
        Self::check_price(stall.price);
        let mut settings = Self::settings(&env);
        let meal_id = settings.next_meal;
        settings.next_meal = meal_id + 1;
        let now = env.ledger().timestamp();
        let meal = Meal {
            buyer: buyer.clone(),
            stall_id,
            payout: stall.payout,
            amount: stall.price,
            fingerprint,
            backup_fingerprint,
            bought_at: now,
            expires_at: now + settings.refund_seconds,
            status: MealStatus::Waiting,
        };
        soroban_sdk::token::Client::new(&env, &settings.usdc).transfer(
            &buyer,
            &env.current_contract_address(),
            &stall.price,
        );
        let key = DataKey::Meal(meal_id);
        env.storage().persistent().set(&key, &meal);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage().instance().set(&DataKey::Settings, &settings);
        Self::touch_instance(&env);
        BoughtEvent {
            meal_id,
            stall_id,
            buyer,
            amount: meal.amount,
        }
        .publish(&env);
        meal_id
    }

    pub fn serve(env: Env, meal_id: u64, preimage: BytesN<32>) {
        Self::touch_instance(&env);
        let mut meal = Self::meal(&env, meal_id);
        if meal.status != MealStatus::Waiting {
            panic!("meal already closed")
        }
        if env.ledger().timestamp() >= meal.expires_at {
            panic!("meal expired")
        }
        let digest = env.crypto().sha256(&preimage.clone().into()).to_bytes();
        if digest != meal.fingerprint && digest != meal.backup_fingerprint {
            panic!("wrong secret")
        }
        meal.status = MealStatus::Served;
        let key = DataKey::Meal(meal_id);
        env.storage().persistent().set(&key, &meal);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        let settings = Self::settings(&env);
        soroban_sdk::token::Client::new(&env, &settings.usdc).transfer(
            &env.current_contract_address(),
            &meal.payout,
            &meal.amount,
        );
        ServedEvent {
            meal_id,
            stall_id: meal.stall_id,
            payout: meal.payout,
            amount: meal.amount,
        }
        .publish(&env);
    }

    pub fn refund(env: Env, meal_id: u64) {
        Self::touch_instance(&env);
        let mut meal = Self::meal(&env, meal_id);
        if meal.status != MealStatus::Waiting {
            panic!("meal already closed")
        }
        if env.ledger().timestamp() < meal.expires_at {
            panic!("meal not expired")
        }
        meal.status = MealStatus::Returned;
        let key = DataKey::Meal(meal_id);
        env.storage().persistent().set(&key, &meal);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        let settings = Self::settings(&env);
        soroban_sdk::token::Client::new(&env, &settings.usdc).transfer(
            &env.current_contract_address(),
            &meal.buyer,
            &meal.amount,
        );
        ReturnedEvent {
            meal_id,
            buyer: meal.buyer,
            amount: meal.amount,
        }
        .publish(&env);
    }

    pub fn get_meal(env: Env, meal_id: u64) -> Option<Meal> {
        Self::touch_instance(&env);
        let key = DataKey::Meal(meal_id);
        let meal = env.storage().persistent().get(&key);
        if meal.is_some() {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        }
        meal
    }

    pub fn get_stall(env: Env, stall_id: u32) -> Option<Stall> {
        Self::touch_instance(&env);
        let key = DataKey::Stall(stall_id);
        let stall = env.storage().persistent().get(&key);
        if stall.is_some() {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        }
        stall
    }

    pub fn get_settings(env: Env) -> Option<Settings> {
        Self::touch_instance(&env);
        env.storage().instance().get(&DataKey::Settings)
    }

    pub fn next_meal_id(env: Env) -> u64 {
        Self::touch_instance(&env);
        Self::settings(&env).next_meal
    }

    pub fn keep_alive(env: Env, meal_id: u64) {
        Self::touch_instance(&env);
        let key = DataKey::Meal(meal_id);
        if env.storage().persistent().has(&key) {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        }
    }

    fn settings(env: &Env) -> Settings {
        env.storage()
            .instance()
            .get(&DataKey::Settings)
            .unwrap_or_else(|| panic!("not initialized"))
    }

    fn stall(env: &Env, stall_id: u32) -> Stall {
        let key = DataKey::Stall(stall_id);
        let stall: Stall = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("stall not found"));
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        stall
    }

    fn meal(env: &Env, meal_id: u64) -> Meal {
        let key = DataKey::Meal(meal_id);
        let meal: Meal = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("meal not found"));
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        meal
    }

    fn write_stall(env: &Env, stall_id: u32, stall: Stall) {
        let key = DataKey::Stall(stall_id);
        env.storage().persistent().set(&key, &stall);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    fn touch_instance(env: &Env) {
        if env.storage().instance().has(&DataKey::Settings) {
            env.storage()
                .instance()
                .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        }
    }

    fn require_admin(env: &Env) {
        let settings = Self::settings(env);
        settings.admin.require_auth();
    }

    fn check_price(price: i128) {
        if price < MIN_PRICE {
            panic!("price below one dollar")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{MealStatus, PendienteLocker, PendienteLockerClient, MIN_PRICE, USDC_SCALE};
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token::{Client as TokenClient, StellarAssetClient},
        Address, BytesN, Env,
    };

    const STALL_ID: u32 = 7;
    const MEAL_PRICE: i128 = 30_000_000;
    const DAY_SECONDS: u64 = 86_400;

    struct Fixture {
        env: Env,
        locker: Address,
        usdc: Address,
        buyer: Address,
        first_payout: Address,
        second_payout: Address,
    }

    fn fixture() -> Fixture {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let buyer = Address::generate(&env);
        let first_payout = Address::generate(&env);
        let second_payout = Address::generate(&env);
        let usdc = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let locker = env.register(PendienteLocker, ());
        let client = PendienteLockerClient::new(&env, &locker);
        client.init(&admin, &usdc, &(21 * DAY_SECONDS));
        client.add_stall(&STALL_ID, &first_payout, &MEAL_PRICE, &true);
        StellarAssetClient::new(&env, &usdc).mint(&buyer, &(MEAL_PRICE * 5));
        env.ledger().set_timestamp(1);
        Fixture {
            env,
            locker,
            usdc,
            buyer,
            first_payout,
            second_payout,
        }
    }

    fn qr_preimage(env: &Env, value: u8) -> BytesN<32> {
        BytesN::from_array(env, &[value; 32])
    }

    fn backup_preimage(env: &Env, value: u8) -> BytesN<32> {
        BytesN::from_array(env, &[value + 10; 32])
    }

    fn fingerprint(env: &Env, preimage: &BytesN<32>) -> BytesN<32> {
        env.crypto().sha256(&preimage.clone().into()).to_bytes()
    }

    #[test]
    fn price_floor_is_one_dollar() {
        assert_eq!(MIN_PRICE, USDC_SCALE);
        assert!(MIN_PRICE >= 10_000_000);
    }

    #[test]
    #[should_panic]
    fn init_twice_is_refused() {
        let f = fixture();
        let client = PendienteLockerClient::new(&f.env, &f.locker);
        client.init(&Address::generate(&f.env), &f.usdc, &(21 * DAY_SECONDS));
    }

    #[test]
    #[should_panic]
    fn zero_refund_time_is_refused() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let usdc = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let locker = env.register(PendienteLocker, ());
        PendienteLockerClient::new(&env, &locker).init(&admin, &usdc, &0);
    }

    #[test]
    #[should_panic]
    fn non_admin_cannot_add_stall() {
        let f = fixture();
        let client = PendienteLockerClient::new(&f.env, &f.locker);
        let stranger = Address::generate(&f.env);
        client
            .mock_auths(&[])
            .add_stall(&8, &stranger, &MEAL_PRICE, &true);
    }

    #[test]
    fn buy_then_serve_with_qr_pays_exact_price() {
        let f = fixture();
        let client = PendienteLockerClient::new(&f.env, &f.locker);
        let qr = qr_preimage(&f.env, 1);
        let backup = backup_preimage(&f.env, 1);
        let meal_id = client.buy(
            &f.buyer,
            &STALL_ID,
            &fingerprint(&f.env, &qr),
            &fingerprint(&f.env, &backup),
        );
        let token = TokenClient::new(&f.env, &f.usdc);
        assert_eq!(token.balance(&f.locker), MEAL_PRICE);
        client.serve(&meal_id, &qr);
        assert_eq!(token.balance(&f.first_payout), MEAL_PRICE);
        assert_eq!(token.balance(&f.locker), 0);
        assert_eq!(client.get_meal(&meal_id).unwrap().status, MealStatus::Served);
    }

    #[test]
    fn serve_with_backup_preimage_works() {
        let f = fixture();
        let client = PendienteLockerClient::new(&f.env, &f.locker);
        let qr = qr_preimage(&f.env, 2);
        let backup = backup_preimage(&f.env, 2);
        let meal_id = client.buy(
            &f.buyer,
            &STALL_ID,
            &fingerprint(&f.env, &qr),
            &fingerprint(&f.env, &backup),
        );
        client.serve(&meal_id, &backup);
        assert_eq!(client.get_meal(&meal_id).unwrap().status, MealStatus::Served);
    }

    #[test]
    #[should_panic]
    fn wrong_preimage_is_refused() {
        let f = fixture();
        let client = PendienteLockerClient::new(&f.env, &f.locker);
        let qr = qr_preimage(&f.env, 3);
        let backup = backup_preimage(&f.env, 3);
        let meal_id = client.buy(
            &f.buyer,
            &STALL_ID,
            &fingerprint(&f.env, &qr),
            &fingerprint(&f.env, &backup),
        );
        client.serve(&meal_id, &qr_preimage(&f.env, 99));
    }

    #[test]
    #[should_panic]
    fn serving_twice_is_refused() {
        let f = fixture();
        let client = PendienteLockerClient::new(&f.env, &f.locker);
        let qr = qr_preimage(&f.env, 4);
        let backup = backup_preimage(&f.env, 4);
        let meal_id = client.buy(
            &f.buyer,
            &STALL_ID,
            &fingerprint(&f.env, &qr),
            &fingerprint(&f.env, &backup),
        );
        client.serve(&meal_id, &qr);
        client.serve(&meal_id, &qr);
    }

    #[test]
    #[should_panic]
    fn refund_before_expiry_is_refused() {
        let f = fixture();
        let client = PendienteLockerClient::new(&f.env, &f.locker);
        let qr = qr_preimage(&f.env, 5);
        let backup = backup_preimage(&f.env, 5);
        let meal_id = client.buy(
            &f.buyer,
            &STALL_ID,
            &fingerprint(&f.env, &qr),
            &fingerprint(&f.env, &backup),
        );
        client.refund(&meal_id);
    }

    #[test]
    fn refund_after_expiry_returns_full_price() {
        let f = fixture();
        let client = PendienteLockerClient::new(&f.env, &f.locker);
        let qr = qr_preimage(&f.env, 6);
        let backup = backup_preimage(&f.env, 6);
        let meal_id = client.buy(
            &f.buyer,
            &STALL_ID,
            &fingerprint(&f.env, &qr),
            &fingerprint(&f.env, &backup),
        );
        let token = TokenClient::new(&f.env, &f.usdc);
        f.env.ledger().set_timestamp(1 + 21 * DAY_SECONDS);
        client.refund(&meal_id);
        assert_eq!(token.balance(&f.buyer), MEAL_PRICE * 5);
        assert_eq!(token.balance(&f.locker), 0);
        assert_eq!(client.get_meal(&meal_id).unwrap().status, MealStatus::Returned);
    }

    #[test]
    #[should_panic]
    fn serving_after_expiry_is_refused() {
        let f = fixture();
        let client = PendienteLockerClient::new(&f.env, &f.locker);
        let qr = qr_preimage(&f.env, 7);
        let backup = backup_preimage(&f.env, 7);
        let meal_id = client.buy(
            &f.buyer,
            &STALL_ID,
            &fingerprint(&f.env, &qr),
            &fingerprint(&f.env, &backup),
        );
        f.env
            .ledger()
            .set_timestamp(1 + 21 * DAY_SECONDS + 1);
        client.serve(&meal_id, &qr);
    }

    #[test]
    #[should_panic]
    fn serving_at_expiry_is_refused() {
        let f = fixture();
        let client = PendienteLockerClient::new(&f.env, &f.locker);
        let qr = qr_preimage(&f.env, 8);
        let backup = backup_preimage(&f.env, 8);
        let meal_id = client.buy(
            &f.buyer,
            &STALL_ID,
            &fingerprint(&f.env, &qr),
            &fingerprint(&f.env, &backup),
        );
        f.env.ledger().set_timestamp(1 + 21 * DAY_SECONDS);
        client.serve(&meal_id, &qr);
    }

    #[test]
    #[should_panic]
    fn refund_after_serving_is_refused() {
        let f = fixture();
        let client = PendienteLockerClient::new(&f.env, &f.locker);
        let qr = qr_preimage(&f.env, 9);
        let backup = backup_preimage(&f.env, 9);
        let meal_id = client.buy(
            &f.buyer,
            &STALL_ID,
            &fingerprint(&f.env, &qr),
            &fingerprint(&f.env, &backup),
        );
        client.serve(&meal_id, &qr);
        f.env.ledger().set_timestamp(1 + 21 * DAY_SECONDS);
        client.refund(&meal_id);
    }

    #[test]
    fn changing_stall_payout_does_not_redirect_existing_meal() {
        let f = fixture();
        let client = PendienteLockerClient::new(&f.env, &f.locker);
        let qr = qr_preimage(&f.env, 10);
        let backup = backup_preimage(&f.env, 10);
        let meal_id = client.buy(
            &f.buyer,
            &STALL_ID,
            &fingerprint(&f.env, &qr),
            &fingerprint(&f.env, &backup),
        );
        client.update_stall(&STALL_ID, &f.second_payout, &MEAL_PRICE, &true);
        client.serve(&meal_id, &qr);
        let token = TokenClient::new(&f.env, &f.usdc);
        assert_eq!(token.balance(&f.first_payout), MEAL_PRICE);
        assert_eq!(token.balance(&f.second_payout), 0);
    }

    #[test]
    #[should_panic]
    fn paused_stall_cannot_be_bought() {
        let f = fixture();
        let client = PendienteLockerClient::new(&f.env, &f.locker);
        client.update_stall(&STALL_ID, &f.first_payout, &MEAL_PRICE, &false);
        let qr = qr_preimage(&f.env, 11);
        let backup = backup_preimage(&f.env, 11);
        client.buy(
            &f.buyer,
            &STALL_ID,
            &fingerprint(&f.env, &qr),
            &fingerprint(&f.env, &backup),
        );
    }

    #[test]
    #[should_panic]
    fn price_below_one_dollar_is_refused_on_update() {
        let f = fixture();
        let client = PendienteLockerClient::new(&f.env, &f.locker);
        client.update_stall(&STALL_ID, &f.first_payout, &(MIN_PRICE - 1), &true);
    }

    #[test]
    #[should_panic]
    fn price_below_one_dollar_is_refused_on_add() {
        let f = fixture();
        let client = PendienteLockerClient::new(&f.env, &f.locker);
        client.add_stall(&88, &f.first_payout, &(MIN_PRICE - 1), &true);
    }

    #[test]
    fn locker_balance_covers_waiting_meals_after_mixed_sequence() {
        let f = fixture();
        let client = PendienteLockerClient::new(&f.env, &f.locker);
        let qr_one = qr_preimage(&f.env, 12);
        let backup_one = backup_preimage(&f.env, 12);
        let qr_two = qr_preimage(&f.env, 13);
        let backup_two = backup_preimage(&f.env, 13);
        let qr_three = qr_preimage(&f.env, 14);
        let backup_three = backup_preimage(&f.env, 14);
        let first = client.buy(
            &f.buyer,
            &STALL_ID,
            &fingerprint(&f.env, &qr_one),
            &fingerprint(&f.env, &backup_one),
        );
        let second = client.buy(
            &f.buyer,
            &STALL_ID,
            &fingerprint(&f.env, &qr_two),
            &fingerprint(&f.env, &backup_two),
        );
        let third = client.buy(
            &f.buyer,
            &STALL_ID,
            &fingerprint(&f.env, &qr_three),
            &fingerprint(&f.env, &backup_three),
        );
        let token = TokenClient::new(&f.env, &f.usdc);
        client.serve(&first, &qr_one);
        f.env.ledger().set_timestamp(1 + 21 * DAY_SECONDS);
        client.refund(&second);
        assert_eq!(token.balance(&f.locker), MEAL_PRICE);
        assert_eq!(client.get_meal(&third).unwrap().status, MealStatus::Waiting);
    }

    #[test]
    #[should_panic]
    fn buy_without_buyer_auth_is_refused() {
        let f = fixture();
        let client = PendienteLockerClient::new(&f.env, &f.locker);
        let qr = qr_preimage(&f.env, 15);
        let backup = backup_preimage(&f.env, 15);
        client.mock_auths(&[]).buy(
            &f.buyer,
            &STALL_ID,
            &fingerprint(&f.env, &qr),
            &fingerprint(&f.env, &backup),
        );
    }

    #[test]
    fn public_views_return_settings_and_next_id() {
        let f = fixture();
        let client = PendienteLockerClient::new(&f.env, &f.locker);
        assert_eq!(client.next_meal_id(), 1);
        assert_eq!(client.get_settings().unwrap().refund_seconds, 21 * DAY_SECONDS);
    }
}
