use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount, Transfer};

declare_id!("3bgJ8TjDebaWM9PRZXLFoviajmunXPGdbWwYBxVsGdme");

#[program]
pub mod spl_transfer_pda {
    use super::*;

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        let transfer_instruction = Transfer {
            from: ctx.accounts.wallet_to_withdraw_from.to_account_info(),
            to: ctx.accounts.tmp_wallet.to_account_info(),
            authority:  ctx.accounts.user_sending.to_account_info()
        };

        let user_sending_key = ctx.accounts.user_sending.key();
        let seed = vec![
            b"wallet".as_ref(),
            user_sending_key.as_ref()
        ];
        let outer = vec![seed.as_slice()];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            transfer_instruction,
            outer.as_slice()
        );

        anchor_spl::token::transfer(cpi_ctx, amount)?;

        ctx.accounts.stake.amount = amount;
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        let transfer_instruction = Transfer {
            from: ctx.accounts.tmp_wallet.to_account_info(),
            to: ctx.accounts.wallet_to_withdraw_from.to_account_info(),
            authority: ctx.accounts.user_sending.to_account_info()
        };

        let user_sending_key = ctx.accounts.user_sending.key();
        let seed = vec![
            b"wallet".as_ref(),
            user_sending_key.as_ref()
        ];
        let outer = vec![seed.as_slice()];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            transfer_instruction,
            outer.as_slice()
        );

        anchor_spl::token::transfer(cpi_ctx, ctx.accounts.stake.amount)?;

        Ok(())
    }

}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub mint_of_token_being_sent: Account<'info, Mint>,

    #[account(mut)]
    pub user_sending: Signer<'info>,

    #[account(
        mut,
        seeds = [b"wallet".as_ref(), user_sending.key().as_ref()],
        bump,
        token::mint = mint_of_token_being_sent,
        token::authority = user_sending
    )]
    pub tmp_wallet: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"stake".as_ref(), user_sending.key().as_ref()],
        bump
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

#[derive(Accounts)]
pub struct Deposit<'info> {
    pub mint_of_token_being_sent: Account<'info, Mint>, // our token

    #[account(mut)]
    pub user_sending: Signer<'info>,

    #[account(
        init,
        payer = user_sending,
        seeds = [b"wallet".as_ref(), user_sending.key().as_ref()],
        bump,
        token::mint = mint_of_token_being_sent,
        token::authority = user_sending
    )]
    pub tmp_wallet: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = user_sending,
        seeds = [b"stake".as_ref(), user_sending.key().as_ref()],
        bump,
        space = 8 + 8
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
    pub amount: u64
}
