import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SplTransferPda } from "../target/types/spl_transfer_pda";
import {createMint, getOrCreateAssociatedTokenAccount, mintToChecked, TOKEN_PROGRAM_ID} from "@solana/spl-token";
import * as assert from "node:assert";

const LAMPORT_PER_SOL = 1000000000;
const ADMIN_SECRET = new Uint8Array([130,  48, 202,   8,  31,  74, 143, 100,  64, 114, 166, 66, 132, 155,  54, 209, 118,  90,  56, 189, 216, 176, 168, 121, 232, 114,  31,  61, 196, 124, 175, 202, 143, 250,  34,  79, 254, 211, 237, 128,  37, 151, 253, 122, 189,  75, 128,  67, 236, 175,  68, 138, 101,  19,  21, 200, 254,  44, 208,  24,  65,  70,  98, 164])
const TOKEN_SECRET = new Uint8Array([ 78, 234, 114,  83, 170,   3,  69, 179,  91,  13, 155, 96,  13,  61,  85, 197, 108, 208,  46,   4, 153,  11, 143,  40,  85, 215, 209, 162, 139, 218,  43,  18, 157, 189, 122, 245, 240, 128, 181, 240,  92, 228, 148, 144, 243,  95,  42, 165,  62,  51, 133,  86, 176,  57,  53, 44,  39, 130, 123,  73, 170, 244, 108, 235])

describe("spl_transfer_pda", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();

  anchor.setProvider(provider);

  const program = anchor.workspace.SplTransferPda as Program<SplTransferPda>;

  let mintPubKey = null;
  let fromAta = null;
  let adminAta = null;

  const adminWallet = anchor.web3.Keypair.fromSecretKey(ADMIN_SECRET);
  console.log(adminWallet.secretKey);
  console.log(adminWallet.publicKey);

  const fromWallet = anchor.web3.Keypair.generate();
  const authority = anchor.web3.Keypair.generate();

    const [vaultPda, _vaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("wallet"), fromWallet.publicKey.toBuffer()],
        program.programId
    );

    const [stakePda, _stakeBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("stake"), fromWallet.publicKey.toBuffer()],
        program.programId
    );

    const [appWallet, _] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("app_wallet")],
        program.programId
    );

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

    await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(adminWallet.publicKey, LAMPORT_PER_SOL * 1000),
        "confirmed"
    );

    console.log("Creating token mint..")
    const mintKeyPair = anchor.web3.Keypair.fromSecretKey(TOKEN_SECRET);

    mintPubKey = await createMint(
        provider.connection,
        authority,
        authority.publicKey,
        null,
        8,
        mintKeyPair);

    console.log("Creating ATA to 'Admin' wallet");
    adminAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        authority,
        mintPubKey,
        adminWallet.publicKey
    );

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

    console.log("Mint tokens to admin wallet");
    await mintToChecked(
        provider.connection,
        adminWallet,
        mintPubKey,
        adminAta.address,
        authority,
        72_000_000e8,
        8
    );

    console.log("Starting initialize..");
    await program.methods
        .init()
        .accounts({
          mintOfTokenBeingSent: mintPubKey,
          admin: adminWallet.publicKey,
          appWallet: appWallet,
          adminAta: adminAta.address
        })
        .signers([adminWallet])
        .rpc();

  });

  it("deposit", async () => {
    const beforeBalance = await provider.connection.getTokenAccountBalance(fromAta.address);
    console.log("Before balance - ", beforeBalance.value.amount);

    await program.methods
        .deposit(new anchor.BN(1e8))
        .accounts({
          mintOfTokenBeingSent: mintPubKey,
          userSending: fromWallet.publicKey,
          tmpWallet: vaultPda,
          walletToWithdrawFrom: fromAta.address,
          stake: stakePda,
        })
        .signers([fromWallet])
        .rpc();

    let afterBalance = await provider.connection.getTokenAccountBalance(fromAta.address);
    console.log("After balance - ", afterBalance.value.amount);

    const tmpWalletBalance = await provider.connection.getTokenAccountBalance(vaultPda);
    console.log("Tmp wallet balance - ", tmpWalletBalance.value.amount);
  });

  it("duplicate deposit", async() => {
        try {
            await program.methods
                .deposit(new anchor.BN(2e8))
                .accounts({
                    mintOfTokenBeingSent: mintPubKey,
                    userSending: fromWallet.publicKey,
                    tmpWallet: vaultPda,
                    walletToWithdrawFrom: fromAta.address,
                    stake: stakePda,
                })
                .signers([fromWallet])
                .rpc();

            assert.fail("Contract allowed duplicate deposit");
        } catch {
            assert.ok("Contract throw exception on duplicate deposit");
        }
  })

  it("withdraw", async () => {
      await new Promise(f => setTimeout(f, 3000));
    const beforeBalance = await provider.connection.getTokenAccountBalance(fromAta.address);
    console.log("Before balance - ", beforeBalance.value.amount);

    let result = await program.methods
      .withdraw()
      .accounts({
          mintOfTokenBeingSent: mintPubKey,
          userSending: fromWallet.publicKey,
          walletToWithdrawFrom: fromAta.address,
          stake: stakePda,
          tmpWallet: vaultPda,
          appWallet: appWallet
      })
      .signers([fromWallet])
      .rpc();

      await new Promise(f => setTimeout(f, 3000));

    const info = await provider.connection.getParsedTransaction(result, "confirmed");
    console.log("Tx info - ", info.meta.logMessages);

    let afterBalance = await provider.connection.getTokenAccountBalance(fromAta.address);
    console.log("After balance - ", afterBalance.value.amount);

    let tmpWalletBalance = await provider.connection.getTokenAccountBalance(vaultPda);
    console.log("After tmp wallet balance - ", tmpWalletBalance.value.amount);
  });

  it("duplicate withdraw", async () => {
      try {
          await program.methods
              .withdraw()
              .accounts({
                  mintOfTokenBeingSent: mintPubKey,
                  userSending: fromWallet.publicKey,
                  walletToWithdrawFrom: fromAta.address,
                  stake: stakePda,
                  tmpWallet: vaultPda,
                  appWallet: appWallet
              })
              .signers([fromWallet])
              .rpc();
          assert.fail("Contract allowed duplicate withdraw");
      } catch {
          assert.ok("Contract throw exception on duplicate withdraw");
      }
  });

  it("try again deposit", async() => {
      const beforeBalance = await provider.connection.getTokenAccountBalance(fromAta.address);
      console.log("Before balance - ", beforeBalance.value.amount);

      await program.methods
          .deposit(new anchor.BN(1e8))
          .accounts({
              mintOfTokenBeingSent: mintPubKey,
              userSending: fromWallet.publicKey,
              tmpWallet: vaultPda,
              walletToWithdrawFrom: fromAta.address,
              stake: stakePda,
          })
          .signers([fromWallet])
          .rpc();

      let afterBalance = await provider.connection.getTokenAccountBalance(fromAta.address);
      console.log("After balance - ", afterBalance.value.amount);

      const tmpWalletBalance = await provider.connection.getTokenAccountBalance(vaultPda);
      console.log("Tmp wallet balance - ", tmpWalletBalance.value.amount);
  });

  it("try again withdraw", async() => {
      const beforeBalance = await provider.connection.getTokenAccountBalance(fromAta.address);
      console.log("Before balance - ", beforeBalance.value.amount);

      await program.methods
          .withdraw()
          .accounts({
              mintOfTokenBeingSent: mintPubKey,
              userSending: fromWallet.publicKey,
              walletToWithdrawFrom: fromAta.address,
              stake: stakePda,
              tmpWallet: vaultPda,
              appWallet: appWallet
          })
          .signers([fromWallet])
          .rpc();

      let afterBalance = await provider.connection.getTokenAccountBalance(fromAta.address);
      console.log("After balance - ", afterBalance.value.amount);

      let tmpWalletBalance = await provider.connection.getTokenAccountBalance(vaultPda);
      console.log("After tmp wallet balance - ", tmpWalletBalance.value.amount);
  })
});
