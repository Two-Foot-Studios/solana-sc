use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount, Transfer, TransferChecked};
use std::str::FromStr;
use anchor_lang::solana_program::clock::UnixTimestamp;

declare_id!("3bgJ8TjDebaWM9PRZXLFoviajmunXPGdbWwYBxVsGdme");

const STAKE_AMOUNT: u64 = 72_000_000;
// const ADMIN_KEY: Pubkey = Pubkey::from_str("Ah2XCFjHK9kPKuqB2FYYZpwTfE882kzzGdNFRZJ6Go4w").unwrap();
const ADMIN_KEY: &str = "Ah2XCFjHK9kPKuqB2FYYZpwTfE882kzzGdNFRZJ6Go4w";
const TOKEN_MINT: &str = "Bckayy6RpSsBxC2wZKXKeNMVAAnvJeZT23U7DW4CDdAa";

#[program]
pub mod spl_transfer_pda {
    use super::*;

    pub fn init(ctx: Context<Init>) -> Result<()> {
        let admin_key = Pubkey::from_str(ADMIN_KEY).unwrap();
        let token_key = Pubkey::from_str(TOKEN_MINT).unwrap();

        require!(ctx.accounts.mint_of_token_being_sent.key() == token_key, ErrorCodes::IncorrectTokenMint);
        require!(ctx.accounts.admin_ata.amount >= STAKE_AMOUNT, ErrorCodes::NotEnoughTokens);
        require!(ctx.accounts.admin.key() == admin_key, ErrorCodes::Forbidden);

        let transfer_instruction = Transfer {
            from: ctx.accounts.admin_ata.to_account_info(),
            to: ctx.accounts.app_wallet.to_account_info(),
            authority: ctx.accounts.admin.to_account_info()
        };

        let bump = ctx.bumps.app_wallet;
        let binding = [bump];
        let seed: Vec<&[u8]> = vec![
            b"app_wallet",
            &binding
        ];

        let outer = vec![seed.as_slice()];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            transfer_instruction,
            outer.as_slice()
        );

        anchor_spl::token::transfer(cpi_ctx, STAKE_AMOUNT)?;

        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(ctx.accounts.stake.amount == 0, ErrorCodes::DepositAlreadyMade);

        let token_key = Pubkey::from_str(TOKEN_MINT).unwrap();
        require!(ctx.accounts.mint_of_token_being_sent.key() == token_key, ErrorCodes::IncorrectTokenMint);

        let transfer_instruction = Transfer {
            from: ctx.accounts.wallet_to_withdraw_from.to_account_info(),
            to: ctx.accounts.tmp_wallet.to_account_info(),
            authority:  ctx.accounts.user_sending.to_account_info()
        };

        let user_sending_key = ctx.accounts.user_sending.key();

        let bump = ctx.bumps.tmp_wallet;
        let binding = [bump];
        let seed = vec![
            b"wallet",
            user_sending_key.as_ref(),
            &binding
        ];

        let outer = vec![seed.as_slice()];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            transfer_instruction,
            outer.as_slice()
        );

        anchor_spl::token::transfer(cpi_ctx, amount)?;

        ctx.accounts.stake.amount = amount;
        ctx.accounts.stake.signer_key = ctx.accounts.user_sending.key();
        ctx.accounts.stake.start = Clock::get()?.unix_timestamp;

        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        let token_key = Pubkey::from_str(TOKEN_MINT).unwrap();
        require!(ctx.accounts.mint_of_token_being_sent.key() == token_key, ErrorCodes::IncorrectTokenMint);
        require!(ctx.accounts.stake.amount > 0, ErrorCodes::NotEnoughTokens);

        let transfer_instruction = TransferChecked {
            from: ctx.accounts.tmp_wallet.to_account_info(),
            to: ctx.accounts.wallet_to_withdraw_from.to_account_info(),
            authority: ctx.accounts.tmp_wallet.to_account_info(),
            mint: ctx.accounts.mint_of_token_being_sent.to_account_info()
        };

        let user_sending_key = ctx.accounts.user_sending.key();

        let bump = ctx.bumps.tmp_wallet;
        let binding = [bump];
        let seed = vec![
            b"wallet",
            user_sending_key.as_ref(),
            &binding
        ];

        let outer = vec![seed.as_slice()];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            transfer_instruction,
            outer.as_slice()
        );

        anchor_spl::token::transfer_checked(
            cpi_ctx,
            ctx.accounts.stake.amount,
            ctx.accounts.mint_of_token_being_sent.decimals)?;

        let reward_instruction = TransferChecked {
            from: ctx.accounts.app_wallet.to_account_info(),
            to: ctx.accounts.wallet_to_withdraw_from.to_account_info(),
            authority: ctx.accounts.app_wallet.to_account_info(),
            mint: ctx.accounts.mint_of_token_being_sent.to_account_info()
        };

        let bump = ctx.bumps.app_wallet;
        let binding = [bump];
        let seed: Vec<&[u8]> = vec![
            b"app_wallet",
            &binding
        ];

        let outer = vec![seed.as_slice()];
        let reward_cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            reward_instruction,
            outer.as_slice()
        );

        // calculate stake value
        let reward_value: u64 = 10;
        if ctx.accounts.app_wallet.amount < reward_value {
            return Ok(());
        }

        anchor_spl::token::transfer_checked(
          reward_cpi_ctx,
          reward_value,
          ctx.accounts.mint_of_token_being_sent.decimals
        )?;

        ctx.accounts.stake.amount = 0;

        Ok(())
    }

}

#[derive(Accounts)]
pub struct Init<'info> {
    pub mint_of_token_being_sent: Account<'info, Mint>,

    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        seeds = [b"app_wallet"],
        bump,
        token::mint = mint_of_token_being_sent,
        token::authority = app_wallet
    )]
    pub app_wallet: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = admin_ata.owner == admin.key(),
        constraint = admin_ata.mint == mint_of_token_being_sent.key()
    )]
    pub admin_ata: Account<'info, TokenAccount>,

    token_program: Program<'info, Token>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub mint_of_token_being_sent: Account<'info, Mint>,

    #[account(mut)]
    pub user_sending: Signer<'info>,

    #[account(
        mut,
        seeds = [b"wallet", user_sending.key().as_ref()],
        bump,
        token::mint = mint_of_token_being_sent,
        token::authority = tmp_wallet,
    )]
    pub tmp_wallet: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"stake", user_sending.key().as_ref()],
        bump,
        constraint = stake.signer_key == user_sending.key(),
    )]
    pub stake: Account<'info, Stake>,

    #[account(
        mut,
        seeds = [b"app_wallet"],
        bump,
        token::mint = mint_of_token_being_sent,
        token::authority = app_wallet
    )]
    pub app_wallet: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = wallet_to_withdraw_from.owner == user_sending.key(),
        constraint = wallet_to_withdraw_from.mint == mint_of_token_being_sent.key()
    )]
    pub wallet_to_withdraw_from: Account<'info, TokenAccount>,

    token_program: Program<'info, Token>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    pub mint_of_token_being_sent: Account<'info, Mint>, // our token

    #[account(
        init_if_needed,
        seeds = [b"wallet", user_sending.key().as_ref()],
        bump,
        payer = user_sending,
        token::mint = mint_of_token_being_sent,
        token::authority = tmp_wallet
    )]
    pub tmp_wallet: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_sending: Signer<'info>,

    #[account(
        init_if_needed,
        payer = user_sending,
        seeds = [b"stake", user_sending.key().as_ref()],
        bump,
        space = 8 + 8 + 32 + 16
    )]
    pub stake: Account<'info, Stake>,

    #[account(
        mut,
        constraint = wallet_to_withdraw_from.owner == user_sending.key(),
        constraint = wallet_to_withdraw_from.mint == mint_of_token_being_sent.key()
    )]
    pub wallet_to_withdraw_from: Account<'info, TokenAccount>,

    token_program: Program<'info, Token>,
    system_program: Program<'info, System>,
}

#[account]
pub struct Stake {
    pub amount: u64,
    pub signer_key: Pubkey,
    pub start: i64
}

#[error_code]
pub enum ErrorCodes {
    NotEnoughTokens,
    IncorrectTokenMint,
    Forbidden,
    IncorrectDepositValue,
    DepositAlreadyMade
}
