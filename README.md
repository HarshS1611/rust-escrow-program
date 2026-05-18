# Anchor Escrow Program

A simple escrow program built on Solana using **Anchor** that allows two users to safely exchange SPL tokens.
The program supports creating an escrow, taking the escrow to complete the trade, and refunding the escrow if it is not taken.

---

## Features

* Initialize escrow
* Deposit tokens into escrow (Make)
* Take escrow and execute token swap
* Refund escrow and reclaim tokens
* Close escrow and vault accounts
* Test cases for all instructions

---

## Stack

* Solana
* Anchor (Rust)
* SPL Token
* TypeScript tests

---

## Run

```bash
anchor build
anchor test
```

---

## Run on Local Validator

```bash
anchor build
anchor test --skip-local-validator
```

---

## Screenshot of Test Cases Passed

<img width="2256" height="1534" alt="image" src="https://github.com/user-attachments/assets/07d859b8-1d11-4758-830f-91a1dd1aad50" />

