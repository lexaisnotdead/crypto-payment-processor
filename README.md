# Crypto Processor

An automated system for processing cryptocurrency deposits with gas fee optimization. This project uses a microservices architecture to intelligently sweep tokens based on profitability analysis.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Environment Setup](#environment-setup)
- [Running the Application](#running-the-application)
- [API Reference](#api-reference)
- [Smart Contracts](#smart-contracts)
- [Development](#development)

## Overview

Crypto Processor is designed to:

1. Generate unique, deterministic deposit addresses for users
2. Index blockchain events for incoming token transfers
3. Analyze profitability of token sweeps (considering gas costs vs token value)
4. Automatically deploy and execute sweep transactions when profitable
5. Track all transactions and maintain audit logs

**Key Features:**
- Deterministic address generation using CREATE2
- Gas-optimized transactions
- Configurable profitability multipliers
- Redis-based job queue with BullMQ
- Real-time blockchain indexing with Ponder
- PostgreSQL persistence layer

## Architecture

### System Components

```
┌────────────────────────────────────────────────────────────┐
│                     REST API (Hono)                        │
│              Deposit & Transaction Management              │
└──────────────────────────┬─────────────────────────────────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
       ┌────▼─────┐  ┌─────▼──────┐  ┌────▼─────┐
       │PostgreSQL│  │   Redis    │  │  Viem    │
       │   (DB)   │  │  (Queue)   │  │  (RPC)   │
       └──────────┘  └────────────┘  └──────────┘
            ▲              │              ▲
            │         ┌────▼─────┐        │
            │         │  Worker  │────────┤
            │         │ (Sweep)  │        │
            └─────────┴──────────┘        │
                                          │
            ┌─────────────────────────────┘
            │
       ┌────▼─────────────┐
       │ Ponder Indexer   │
       │ (Blockchain      │
       │  listening)      │
       └──────────────────┘
```

### Technology Stack

| Layer | Technology |
|-------|-----------|
| **API Framework** | Hono, Node.js |
| **ORM** | Drizzle ORM |
| **Database** | PostgreSQL |
| **Cache/Queue** | Redis, BullMQ |
| **Blockchain Indexing** | Ponder |
| **Smart Contracts** | Solidity |
| **Contract Dev Tools** | Foundry, Viem |
| **Testing** | Vitest |
| **Container** | Docker, Docker Compose |

## Getting Started

### Prerequisites

- Node.js 22+
- Docker & Docker Compose
- Git

### Installation

* **Clone the repository:**
   ```bash
   git clone https://github.com/lexaisnotdead/crypto-payment-processor.git
   cd crypto-payment-processor
   ```

* **Install dependencies:**
   ```bash
   npm install
   ```

## Environment Setup

### Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL=postgres://postgres:postgres@postgres:5432/crypto_processor
DATABASE_URL_DOCKER=postgres://postgres:postgres@postgres:5432/crypto_processor

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_URL=redis://redis:6379
REDIS_HOST_DOCKER=redis
REDIS_PORT_DOCKER=6379
REDIS_URL_DOCKER=redis://redis:6379

# Network Configuration
CHAIN_ID=11155111
RPC_URL=https://your-rpc-provider
DEFAULT_ERC20_TOKEN=0xbDeaD2A70Fe794D2f97b37EFDE497e68974a296d

# Wallet (for executing sweeps)
PRIVATE_KEY=0xYOUR_PRIVATE_KEY

# External Services
PRICE_API_BASE=https://api.coingecko.com/api/v3

# Server
PORT=3000
```

### Configuration Details

- **CHAIN_ID**: Network identifier (11155111 = Sepolia testnet)
- **RPC_URL**: Blockchain RPC endpoint
- **DEFAULT_ERC20_TOKEN**: fallback token indexed by Ponder even if DB has no active tokens
- **PRIVATE_KEY**: Private key of wallet executing transactions (must have sufficient balance for gas)
- **PRICE_API_BASE**: API for fetching current token prices in USD
- **Contract addresses**: loaded from `addresses/<chainId>.json` (fallback: `addresses/latest.json`)

## Running the Application

### Using Docker Compose (Recommended)

Start all services with a single command:

```bash
docker-compose up
```

This will start:
- **PostgreSQL** - Database (port 5432)
- **Redis** - Cache and job queue (port 6379)
- **API** - REST server (port 3000)
- **Worker** - Background job processor
- **Ponder** - Blockchain indexer

Check service health:
```bash
curl http://localhost:3000/health
```

### Local Development

#### Terminal 1: PostgreSQL & Redis
```bash
docker-compose up postgres redis
```

#### Terminal 2: API Server
```bash
npm exec tsx apps/api/src/server.ts
```

#### Terminal 3: Worker
```bash
npm exec tsx apps/api/src/workers/index.ts
```

#### Terminal 4: Ponder Indexer
```bash
npm exec ponder start --config apps/indexer/ponder.config.ts
```

### Running Tests

```bash
npm run test             # Run all tests once
npm run test:watch       # Run tests in watch mode
```

### Smart Contract Compilation

```bash
npx forge build          # Compile contracts
npx forge test           # Run Solidity tests
npx forge deploy         # Deploy contracts
```

## API Reference

### Deposits

#### Generate or Retrieve Deposit Address

```
GET /v1/deposits/:userId/:tokenAddress
```

**Parameters:**
- `userId` (path): External user identifier
- `tokenAddress` (path): Token contract address (lowercase)

**Response:**
```json
{
  "userId": "uuid",
  "tokenAddress": "0x...",
  "chainId": 11155111,
  "depositAddress": "0x...",
  "salt": "0x...",
  "index": 0
}
```

**Description:** Creates a unique, deterministic deposit address for a user-token pair. Subsequent calls return the same address.

### Transactions

#### Get Transaction History

```
GET /v1/transactions?userId=...&status=...&type=...
```

**Optional Parameters:**
- `userId`: Filter by user ID
- `status`: `PENDING`, `CONFIRMED`, or `FAILED`
- `type`: `DEPOSIT` or `SWEEP`

**Response:**
```json
{
  "transactions": [
    {
      "id": "uuid",
      "type": "SWEEP",
      "status": "CONFIRMED",
      "chainId": 11155111,
      "tokenAddress": "0x...",
      "amountWei": "1000000000000000000",
      "txHash": "0x...",
      "gasPriceWei": "1000000000",
      "gasUsed": "50000",
      "meta": {
        "decision": "SWEEP",
        "tokenValueUsd": "2500.00",
        "gasCostUsd": "1.50",
        "multiplier": "10.0"
      }
    }
  ]
}
```

### Tokens

#### Add or Update Supported Token

```
POST /v1/tokens
```

**Optional Parameters:**
 - `chainId`: `11155111` by default
 - `isActive`: Status
 - `sweepGasMultiplier`: Multiplier for calculating profitability

**Request body:**
```json
{
  "tokenAddress": "0x...",
  "symbol": "USDT",
  "decimals": 6,
  "chainId": 11155111,
  "isActive": true,
  "sweepGasMultiplier": "10.0"
}
```

#### List Supported Tokens

```
GET /v1/tokens?chainId=11155111
```

### Health Check

```
GET /health
```

**Response:**
```json
{ "ok": true }
```

## Smart Contracts

### WalletFactory.sol

Factory contract for creating deterministic wallet clones using EIP-1167 (Minimal Proxy).

**Key Functions:**
- `deployAndSweep(bytes32 salt, address token)` - Creates wallet and sweeps tokens
- `setTreasury(address newTreasury)` - Update treasury address
- `predictDeterministicAddress(bytes32 salt)` - Preview wallet address

**Key Features:**
- Deterministic deployment using CREATE2
- Automatic initialization on first deployment
- Treasury updates for existing wallets
- Automatic balance checking and sweeping

### DepositLogic.sol

Implementation contract for individual wallet logic (deployed as proxy clones).

**Key Functions:**
- `initialize(address owner, address treasury)` - Initialize new wallet
- `sweep(address token)` - Sweep token balance to treasury
- `setTreasury(address newTreasury)` - Update treasury address

**Key Features:**
- UUPS-compatible upgradeable contract
- Ownable (only factory can call)
- SafeERC20 for safe token transfers
- All balances go to configurable treasury

## Sweep Logic & Profitability Analysis

The system decides whether to sweep tokens based on:

```
SWEEP if: tokenValue >= gasEstimate x multiplier
```

Where:
- `tokenValue` = Current token balance in USD (E18 precision)
- `gasEstimate` = Estimated gas cost in USD
- `multiplier` = Configurable factor (default 10x)

**Example:**
- Token value: $2,500
- Gas cost: $100
- Multiplier: 10x
- Threshold: $100 x 10 = $1,000
- Decision: $2,500 >= $1,000 -> **SWEEP**

Metadata about each decision is stored in the `transactions` table for audit trails.
