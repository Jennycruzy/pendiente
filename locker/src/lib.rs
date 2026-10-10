#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env,
};

pub const USDC_SCALE: i128 = 10_000_000;
pub const MIN_PRICE: i128 = USDC_SCALE;
const DAY_SECONDS: u64 = 86_400;

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

#[contract]
pub struct PendienteLocker;

#[contractimpl]
impl PendienteLocker {
    pub fn init(env: Env, admin: Address, usdc: Address, refund_days: u32) {
        if env.storage().instance().has(&DataKey::Settings) {
            panic!("already initialized")
        }
        admin.require_auth();
        env.storage().instance().set(
            &DataKey::Settings,
            &Settings {
                admin,
                usdc,
                next_meal: 1,
                refund_seconds: u64::from(refund_days) * DAY_SECONDS,
            },
        );
    }

    pub fn add_stall(env: Env, stall_id: u32, payout: Address, price: i128, active: bool) {
        Self::require_admin(&env);
        Self::check_price(price);
        env.storage().persistent().set(
            &DataKey::Stall(stall_id),
            &Stall { payout, price, active },
        );
    }

    pub fn update_stall(env: Env, stall_id: u32, payout: Address, price: i128, active: bool) {
        Self::require_admin(&env);
        Self::check_price(price);
        if !env.storage().persistent().has(&DataKey::Stall(stall_id)) {
            panic!("stall not found")
        }
        env.storage().persistent().set(
            &DataKey::Stall(stall_id),
            &Stall { payout, price, active },
        );
    }

    pub fn buy(env: Env, buyer: Address, stall_id: u32, fingerprint: BytesN<32>) -> u64 {
        buyer.require_auth();
        let stall: Stall = env
            .storage()
            .persistent()
            .get(&DataKey::Stall(stall_id))
            .unwrap_or_else(|| panic!("stall not found"));
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
            bought_at: now,
            expires_at: now + settings.refund_seconds,
            status: MealStatus::Waiting,
        };
        soroban_sdk::token::Client::new(&env, &settings.usdc).transfer(
            &buyer,
            &env.current_contract_address(),
            &stall.price,
        );
        env.storage().persistent().set(&DataKey::Meal(meal_id), &meal);
        env.storage().instance().set(&DataKey::Settings, &settings);
        env.events().publish((symbol_short!("bought"),), meal_id);
        meal_id
    }

    pub fn serve(env: Env, meal_id: u64, secret: BytesN<32>) {
        let mut meal: Meal = Self::meal(&env, meal_id);
        if meal.status != MealStatus::Waiting {
            panic!("meal already closed")
        }
        if env.ledger().timestamp() > meal.expires_at {
            panic!("meal expired")
        }
        if env.crypto().sha256(&secret.into()) != meal.fingerprint {
            panic!("wrong secret")
        }
        meal.status = MealStatus::Served;
        env.storage().persistent().set(&DataKey::Meal(meal_id), &meal);
        let settings = Self::settings(&env);
        soroban_sdk::token::Client::new(&env, &settings.usdc).transfer(
            &env.current_contract_address(),
            &meal.payout,
            &meal.amount,
        );
        env.events().publish((symbol_short!("served"),), meal_id);
    }

    pub fn refund(env: Env, meal_id: u64) {
        let mut meal: Meal = Self::meal(&env, meal_id);
        if meal.status != MealStatus::Waiting {
            panic!("meal already closed")
        }
        if env.ledger().timestamp() < meal.expires_at {
            panic!("meal not expired")
        }
        meal.status = MealStatus::Returned;
        env.storage().persistent().set(&DataKey::Meal(meal_id), &meal);
        let settings = Self::settings(&env);
        soroban_sdk::token::Client::new(&env, &settings.usdc).transfer(
            &env.current_contract_address(),
            &meal.buyer,
            &meal.amount,
        );
        env.events().publish((symbol_short!("returned"),), meal_id);
    }

    pub fn get_meal(env: Env, meal_id: u64) -> Option<Meal> {
        env.storage().persistent().get(&DataKey::Meal(meal_id))
    }

    pub fn get_stall(env: Env, stall_id: u32) -> Option<Stall> {
        env.storage().persistent().get(&DataKey::Stall(stall_id))
    }

    pub fn keep_alive(env: Env, meal_id: u64) {
        if env.storage().persistent().has(&DataKey::Meal(meal_id)) {
            env.storage().persistent().extend_ttl(&DataKey::Meal(meal_id), 1, 518_400);
        }
    }

    fn settings(env: &Env) -> Settings {
        env.storage()
            .instance()
            .get(&DataKey::Settings)
            .unwrap_or_else(|| panic!("not initialized"))
    }

    fn meal(env: &Env, meal_id: u64) -> Meal {
        env.storage()
            .persistent()
            .get(&DataKey::Meal(meal_id))
            .unwrap_or_else(|| panic!("meal not found"))
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
    use super::{MIN_PRICE, USDC_SCALE};

    #[test]
    fn price_floor_is_one_dollar() {
        assert_eq!(MIN_PRICE, USDC_SCALE);
        assert!(MIN_PRICE >= 10_000_000);
    }
}
