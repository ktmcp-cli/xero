# AGENT.md — Xero CLI for AI Agents

This document explains how to use the Xero CLI as an AI agent.

## Overview

The `xero` CLI provides access to the Xero accounting API. Use it to manage invoices, contacts, accounts, payments, and bank transactions on behalf of users.

## Prerequisites

The CLI must be authenticated before use. Check status with:

```bash
xero auth status
```

If not authenticated, the user must run:
```bash
xero config set --client-id <id> --client-secret <secret>
xero auth login
```

## All Commands

### Config

```bash
xero config set --client-id <id> --client-secret <secret>
xero config set --tenant-id <id>
xero config show
```

### Auth

```bash
xero auth login           # Opens browser for OAuth consent
xero auth status          # Check if authenticated
```

### Invoices

```bash
# List invoices
xero invoices list
xero invoices list --status DRAFT
xero invoices list --status SUBMITTED
xero invoices list --status AUTHORISED
xero invoices list --status PAID
xero invoices list --status VOIDED
xero invoices list --limit 100

# Get single invoice
xero invoices get <invoice-id>

# Create invoice
xero invoices create \
  --contact <contact-id> \
  --line-items '[{"Description":"Item","Quantity":1,"UnitAmount":100,"AccountCode":"200"}]' \
  --type ACCREC \
  --status DRAFT \
  --due-date 2024-03-31
```

Invoice types: `ACCREC` (accounts receivable/sales invoice), `ACCPAY` (accounts payable/bill)
Invoice statuses: `DRAFT`, `SUBMITTED`, `AUTHORISED`, `PAID`, `VOIDED`, `DELETED`

### Contacts

```bash
# List contacts
xero contacts list
xero contacts list --search "company name"

# Get single contact
xero contacts get <contact-id>

# Create contact
xero contacts create --name "Company Name" --email "email@example.com"
xero contacts create --name "Company Name" --email "email@example.com" --phone "+1234567890"
```

### Accounts

```bash
xero accounts list
```

Account types include: `BANK`, `CURRENT`, `CURRLIAB`, `DEPRECIATN`, `DIRECTCOSTS`, `EQUITY`, `EXPENSE`, `FIXED`, `INVENTORY`, `LIABILITY`, `NONCURRENT`, `OTHERINCOME`, `OVERHEADS`, `PREPAYMENT`, `REVENUE`, `SALES`, `TERMLIAB`, `PAYGLIABILITY`, `SUPERANNUATIONEXPENSE`, `SUPERANNUATIONLIABILITY`, `WAGESEXPENSE`, `WAGESPAYABLELIABILITY`

### Payments

```bash
xero payments list
```

### Bank Transactions

```bash
xero bank-transactions list
xero bank-transactions list --account-id <account-id>
```

## JSON Output

All list and get commands support `--json` for structured output. Always use `--json` when parsing results programmatically:

```bash
xero invoices list --json
xero contacts list --json
xero accounts list --json
xero payments list --json
xero bank-transactions list --json
```

## Example Workflows

### Find and display outstanding invoices

```bash
# Get all authorised (unpaid) invoices as JSON
xero invoices list --status AUTHORISED --json
```

### Create an invoice for a customer

```bash
# Step 1: Find the customer contact ID
xero contacts list --search "Customer Name" --json

# Step 2: Find the appropriate account code
xero accounts list --json

# Step 3: Create the invoice
xero invoices create \
  --contact <contact-id-from-step-1> \
  --line-items '[{"Description":"Service Description","Quantity":1,"UnitAmount":500,"AccountCode":"200"}]' \
  --status DRAFT
```

### Check payment status

```bash
# Get all paid invoices
xero invoices list --status PAID --json

# List all payments
xero payments list --json
```

### Bank reconciliation workflow

```bash
# List bank accounts
xero accounts list --json | jq '.[] | select(.Type == "BANK")'

# Get transactions for a specific bank account
xero bank-transactions list --account-id <bank-account-id> --json
```

## Line Items Format

When creating invoices, line items must be a JSON array:

```json
[
  {
    "Description": "Item description",
    "Quantity": 1,
    "UnitAmount": 100.00,
    "AccountCode": "200",
    "TaxType": "OUTPUT"
  }
]
```

Required fields: `Description`, `Quantity`, `UnitAmount`, `AccountCode`
Optional fields: `TaxType`, `LineItemID`, `ItemCode`, `DiscountRate`

Common account codes (varies by organisation):
- `200` — Sales
- `400` — Advertising
- `404` — Entertainment
- `408` — IT Software

## Error Handling

The CLI exits with code 1 on error and prints an error message to stderr. Common errors:

- `Authentication failed` — Run `xero auth login`
- `No tenant ID configured` — Run `xero auth login`
- `Resource not found` — Check the ID is correct
- `Rate limit exceeded` — Wait before retrying

## Tips for Agents

1. Always use `--json` when you need to extract specific fields
2. Use the search feature in `contacts list --search` before creating new contacts to avoid duplicates
3. When creating invoices, verify the contact ID and account code exist first
4. The `InvoiceID` field is a UUID — use the full UUID for API calls
5. Token refresh is handled automatically — no need to re-authenticate unless the refresh token expires (typically 60 days)
