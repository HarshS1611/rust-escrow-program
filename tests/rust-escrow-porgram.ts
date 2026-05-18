import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { RustEscrowPorgram } from "../target/types/rust_escrow_porgram";
import { expect } from "chai";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createMint,
  mintTo,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair } from "@solana/web3.js";

describe("rust_escrow_porgram", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program =
    anchor.workspace.RustEscrowPorgram as Program<RustEscrowPorgram>;

  const maker = Keypair.generate();
  const taker = Keypair.generate();

  let mintA: anchor.web3.PublicKey;
  let mintB: anchor.web3.PublicKey;

  let makerAtaA: anchor.web3.PublicKey;
  let takerAtaB: anchor.web3.PublicKey;
  let makerAtaB: anchor.web3.PublicKey;
  let takerAtaA: anchor.web3.PublicKey;

  let escrowPda: anchor.web3.PublicKey;
  let escrowBump: number;
  let vault: anchor.web3.PublicKey;

  const depositAmount = 100;
  const receiveAmount = 200;

  before(async () => {
    console.log("Airdropping SOL to maker...");
    const makerAirdrop = await provider.connection.requestAirdrop(
      maker.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );

    console.log("Maker Airdrop Tx:", makerAirdrop);

    console.log("Airdropping SOL to taker...");
    const takerAirdrop = await provider.connection.requestAirdrop(
      taker.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );

    console.log("Taker Airdrop Tx:", takerAirdrop);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log("Creating Mint A...");
    mintA = await createMint(
      provider.connection,
      maker,
      maker.publicKey,
      null,
      0
    );

    console.log("Mint A:", mintA.toBase58());

    console.log("Creating Mint B...");
    mintB = await createMint(
      provider.connection,
      taker,
      taker.publicKey,
      null,
      0
    );

    console.log("Mint B:", mintB.toBase58());

    makerAtaA = getAssociatedTokenAddressSync(mintA, maker.publicKey);

    const makerAtaTx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        provider.wallet.publicKey,
        makerAtaA,
        maker.publicKey,
        mintA
      )
    );

    await provider.sendAndConfirm(makerAtaTx);

    console.log("Minting tokens to maker...");
    const makerMintSig = await mintTo(
      provider.connection,
      maker,
      mintA,
      makerAtaA,
      maker,
      depositAmount * 2
    );

    console.log("Maker Mint Tx:", makerMintSig);

    takerAtaB = getAssociatedTokenAddressSync(mintB, taker.publicKey);

    const takerAtaTx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        taker.publicKey,
        takerAtaB,
        taker.publicKey,
        mintB
      )
    );

    await provider.sendAndConfirm(takerAtaTx, [taker]);

    console.log("Minting tokens to taker...");
    const takerMintSig = await mintTo(
      provider.connection,
      taker,
      mintB,
      takerAtaB,
      taker,
      receiveAmount * 2
    );

    console.log("Taker Mint Tx:", takerMintSig);
  });

  it("Airdrops SOL and creates token mints", async () => {
    console.log("Maker:", maker.publicKey.toBase58());
    console.log("Taker:", taker.publicKey.toBase58());

    console.log("Mint A:", mintA.toBase58());
    console.log("Mint B:", mintB.toBase58());

    const makerBalance = await provider.connection.getBalance(
      maker.publicKey
    );

    const takerBalance = await provider.connection.getBalance(
      taker.publicKey
    );

    expect(makerBalance).to.be.greaterThan(0);
    expect(takerBalance).to.be.greaterThan(0);
  });

  it("Creates escrow successfully", async () => {
    const seed1 = new anchor.BN(1111);

    [escrowPda, escrowBump] =
      anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("escrow"),
          maker.publicKey.toBuffer(),
          seed1.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

    vault = getAssociatedTokenAddressSync(mintA, escrowPda, true);

    await program.methods
      .make(
        seed1,
        new anchor.BN(depositAmount),
        new anchor.BN(receiveAmount)
      )
      .accountsStrict({
        maker: maker.publicKey,
        mintA,
        mintB,
        makerAtaA,
        escrow: escrowPda,
        vault,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([maker])
      .rpc();

    console.log("Escrow PDA:", escrowPda.toBase58());
  });

  it("Stores correct escrow state and vault balance", async () => {
    const escrowAccount = await program.account.escrow.fetch(escrowPda);

    expect(escrowAccount.maker.toBase58()).to.equal(
      maker.publicKey.toBase58()
    );

    expect(escrowAccount.mintA.toBase58()).to.equal(mintA.toBase58());

    expect(escrowAccount.mintB.toBase58()).to.equal(mintB.toBase58());

    expect(escrowAccount.receive.toNumber()).to.equal(receiveAmount);

    expect(escrowAccount.bump).to.equal(escrowBump);

    const vaultBalance = (
      await provider.connection.getTokenAccountBalance(vault)
    ).value.uiAmount;

    console.log("Vault Balance:", vaultBalance);

    expect(vaultBalance).to.equal(depositAmount);
  });

  it("Refunds escrow successfully", async () => {
    await program.methods
      .refund()
      .accountsStrict({
        maker: maker.publicKey,
        mintA,
        makerAtaA,
        escrow: escrowPda,
        vault,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([maker])
      .rpc();

    const escrowInfo = await provider.connection.getAccountInfo(
      escrowPda
    );

    const vaultInfo = await provider.connection.getAccountInfo(vault);

    expect(escrowInfo).to.be.null;
    expect(vaultInfo).to.be.null;

    console.log("Escrow refunded and closed");
  });

  it("Takes escrow successfully", async () => {
    const seed2 = new anchor.BN(2222);

    [escrowPda, escrowBump] =
      anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("escrow"),
          maker.publicKey.toBuffer(),
          seed2.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

    vault = getAssociatedTokenAddressSync(mintA, escrowPda, true);

    await program.methods
      .make(
        seed2,
        new anchor.BN(depositAmount),
        new anchor.BN(receiveAmount)
      )
      .accountsStrict({
        maker: maker.publicKey,
        mintA,
        mintB,
        makerAtaA,
        escrow: escrowPda,
        vault,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([maker])
      .rpc();

    takerAtaA = getAssociatedTokenAddressSync(
      mintA,
      taker.publicKey
    );

    makerAtaB = getAssociatedTokenAddressSync(
      mintB,
      maker.publicKey
    );

    await program.methods
      .take()
      .accountsStrict({
        taker: taker.publicKey,
        maker: maker.publicKey,
        mintA,
        mintB,
        takerAtaA,
        takerAtaB,
        makerAtaB,
        escrow: escrowPda,
        vault,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([taker])
      .rpc();

    console.log("Escrow taken successfully");
  });

  it("Transfers tokens correctly after take", async () => {
    const takerBalanceA = (
      await provider.connection.getTokenAccountBalance(takerAtaA)
    ).value.uiAmount;

    const makerBalanceB = (
      await provider.connection.getTokenAccountBalance(makerAtaB)
    ).value.uiAmount;

    console.log("Taker Token A Balance:", takerBalanceA);
    console.log("Maker Token B Balance:", makerBalanceB);

    expect(takerBalanceA).to.equal(depositAmount);
    expect(makerBalanceB).to.equal(receiveAmount);

    const escrowInfo = await provider.connection.getAccountInfo(
      escrowPda
    );

    const vaultInfo = await provider.connection.getAccountInfo(vault);

    expect(escrowInfo).to.be.null;
    expect(vaultInfo).to.be.null;

    console.log("Escrow closed after take");
  });
});