# Vyron — Industry & Dataset Catalog

The catalog is a configurable starting point. It does not create teams or load data by itself. Each project chooses the industries and datasets approved by its trainer.

## Banking & Financial Services
- Customers (synthetic identifiers and demographics)
- Accounts and account types
- Transactions and transfers
- Debit and credit card activity (tokenized synthetic card references only)
- Loans, repayments and delinquency
- Branches and service channels
- Complaints and service requests
- Fraud alerts and investigation outcomes

Possible questions: transaction trends, customer segmentation, loan default patterns, repayment performance, fraud-alert distribution and branch/channel performance.

## Hospital & Healthcare
- Patients (synthetic IDs only)
- Appointments and no-show status
- Admissions and discharges
- Lab orders and results (synthetic)
- Pharmacy and medication inventory (synthetic)
- Billing and insurance claims
- Bed occupancy and department capacity
- Doctors, departments and operating theatre utilization

Possible questions: appointment no-shows, wait times, bed occupancy, claim processing, inventory utilization and department workload.

**Privacy:** never load real identifiable patient data for a training project without formal institutional authorization, legal review and appropriate safeguards. Synthetic data is the default.

## Logistics & Supply Chain
- Orders and order lines
- Shipments and shipment events
- Delivery attempts and delays
- Vehicles and fleet utilization
- Warehouses and inventory
- Routes and transport modes
- Returns and damaged shipments
- Supplier performance

Possible questions: on-time delivery, cost per shipment, route performance, inventory turnover, warehouse utilization and return rates.

## Retail & E-commerce
- Customers (synthetic)
- Products and categories
- Orders and order lines
- Payments (no real card details)
- Returns and refunds
- Inventory and stock movements
- Promotions and discounts
- Channels and fulfillment

Possible questions: sales trends, basket size, repeat purchase, returns, stock-outs and promotion effectiveness.

## Additional future industry templates
Manufacturing, education, insurance, telecom, HR/payroll, energy, agriculture, real estate, travel/hospitality, marketing and IT/SaaS.

## Dataset contract
Every dataset should declare:
- Industry, dataset name and business purpose.
- Primary key and relationship keys.
- Column name, type, definition and allowed values.
- Sensitivity classification (Public, Internal, Confidential, Restricted).
- Source type and provenance.
- Owner/steward and refresh cadence.
- Expected row volume and retention policy.
- Validation rules and quality thresholds.
- Version, status (Raw, Cleaned, Validated, Approved) and change notes.

## Relationship design
Use stable synthetic keys and documented foreign-key relationships. Preserve raw source snapshots. Cleaning and validation create new versions; they never silently overwrite the source. Define a data dictionary and a small representative sample before generating large volumes.
