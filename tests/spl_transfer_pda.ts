import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SplTransferPda } from "../target/types/spl_transfer_pda";
import {createMint, getOrCreateAssociatedTokenAccount, mintToChecked, TOKEN_PROGRAM_ID} from "@solana/spl-token";

const LAMPORT_PER_SOL = 1000000000;

describe("spl_transfer_pda", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();

  anchor.setProvider(provider);

  const program = anchor.workspace.SplTransferPda as Program<SplTransferPda>;

  let mintPubKey = null;
  let fromAta = null;

  const fromWallet = anchor.web3.Keypair.generate();
  const authority = anchor.web3.Keypair.generate();

  it("Is init", async () => {
    console.log("Requesting airdrop..")
    await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(authority.publicKey, LAMPORT_PER_SOL * 10),
        "confirmed"
    );

    await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(fromWallet.publicKey, LAMPORT_PER_SOL * 1000),
        "confirmed"
    );

    console.log("Creating token mint..")
    mintPubKey = await createMint(
        provider.connection,
        authority,
        authority.publicKey,
        null,
        8);

    console.log("Creating ATA to 'From' wallet");
    fromAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        authority,
        mintPubKey,
        fromWallet.publicKey
    );

    console.log("Mint tokens to from wallet")
    await mintToChecked(
        provider.connection,
        authority,
        mintPubKey,
        fromAta.address,
        authority,
        10e8,
        8
    );

  });

  it("deposit", async () => {
    const [vaultPda, _vaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("wallet"), fromWallet.publicKey.toBuffer()],
        program.programId
    );

    const [stakePda, _] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("stake"), fromWallet.publicKey.toBuffer()],
        program.programId
    );

    console.log("VaultPda - ", vaultPda);
    console.log("VaultBump - ", _vaultBump);

    const beforeBalance = await provider.connection.getTokenAccountBalance(fromAta.address);
    console.log("Before balance - ", beforeBalance);

    await program.methods
        .deposit(new anchor.BN(1e8))
        .accounts({
          mintOfTokenBeingSent: mintPubKey,
          userSending: fromWallet.publicKey,
          tmpWallet: vaultPda,
          walletToWithdrawFrom: fromAta.address,
          stake: stakePda
        })
        .signers([fromWallet])
        .rpc();

    let afterBalance = await provider.connection.getTokenAccountBalance(fromAta.address);
    console.log("After balance - ", afterBalance);

    let tmpWalletBalance = await provider.connection.getTokenAccountBalance(vaultPda);
    console.log("Tmp wallet balance - ", tmpWalletBalance);
  });

  it("withdraw", async () => {
    const [vaultPda, _vaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("wallet"), fromWallet.publicKey.toBuffer()],
        program.programId
    );

    const [stakePda, _] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("stake"), fromWallet.publicKey.toBuffer()],
        program.programId
    );

    const beforeBalance = await provider.connection.getTokenAccountBalance(fromAta.address);
    console.log("Before balance - ", beforeBalance);

    await program.methods
        .withdraw()
        .accounts({
          mintOfTokenBeingSent: mintPubKey,
          userSending: fromWallet.publicKey,
          tmpWallet:vaultPda,
          walletToWithdrawFrom: fromAta.address,
          stake: stakePda
        })
        .signers([fromWallet])
        .rpc();

    let afterBalance = await provider.connection.getTokenAccountBalance(fromAta.address);
    console.log("After balance - ", afterBalance);

    let tmpWalletBalance = await provider.connection.getTokenAccountBalance(vaultPda);
    console.log("Tmp wallet balance - ", tmpWalletBalance);

    // await program.methods
    //     .deposit(new anchor.BN(1e8))
    //     .accounts({
    //       mintOfTokenBeingSent: mintPubKey,
    //       userSending: fromWallet.publicKey,
    //       tmpWallet: vaultPda,
    //       walletToWithdrawFrom: fromAta.address,
    //       stake: stakePda
    //     })
    //     .signers([fromWallet])
    //     .rpc();
    //
    // tmpWalletBalance = await provider.connection.getTokenAccountBalance(vaultPda);
    // console.log("Tmp wallet balance again - ", tmpWalletBalance);
  })
});
