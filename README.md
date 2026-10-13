# Quintyne Realty inc administration frontend

React + Vite frontend for `D:\Dev\quintynerealty\back`.

## Run locally

Start the backend on port 8002, then run:

```powershell
cd D:\Dev\quintynerealty\front
Copy-Item .env.example .env
npm install
npm run dev
```

Open http://localhost:5174. The API base URL is controlled with `VITE_API_URL` and defaults to `http://localhost:8002`.

The backend `.env` must include:

```text
FRONTEND_URL=http://localhost:5174
CORS_ALLOWED_ORIGINS=http://localhost:5174
```

Microsoft OAuth credentials and MongoDB must also be configured in the backend before authentication can complete.

The frontend also includes receipt screenshot capture, automatic OCR review, Google Drive links, business activity filters, and weekly/monthly/yearly profit-and-loss reports. See the backend README for Drive service-account setup. Non-super-admin roles need the appropriate `RECEIPTS_*` permissions.

## Business receipts

Receipts is the main screen. Upload receipt images or PDFs, review and correct OCR, choose a business / industry type, and explicitly confirm the upload. Supported types are vending machines, third-party sales, rentals, and other. Business type is separate from expense category and income/expense classification.

Search and filter receipts by business type. Open a receipt to review its original file and change its business type with `RECEIPTS_UPDATE`. Financial reports can be filtered by the same types. Older receipts without a business type appear under Other.

Gas & vehicles is a separate screen. Jobs, quotes, drawings, and RFI functionality have been removed from the interface and backend endpoints. Existing records and files are retained.


## HST tracking

Receipts store an optional `hst_amount`, separate from the tax-inclusive receipt total. OCR suggests explicitly labelled HST amounts for user review; no tax is inferred from a rate or total. Enter 0 when no HST was charged, and leave unknown amounts blank. Existing receipts can be updated in Receipt details. Financial reports total CAD HST paid on expenses and HST collected on income separately, using the selected year and business activity, and count expense receipts missing HST. These totals support review; they do not determine input tax credit eligibility. Original receipts remain available.


Annual vehicle kilometres are calculated from non-deleted trips dated in the current calendar year, and update after logging a trip. Trips can be business or personal; older trips without a purpose are treated as business. The insurance business-use percentage uses logged business kilometres divided by all logged kilometres. Insurance estimates assume twelve months at the saved monthly cost and a complete driving log. Historical manually entered annual totals are retained in storage but no longer used for this calculation.


Gas receipt usage is automatic FIFO per vehicle: receipt date first, upload time to break ties. Trips are allocated chronologically and can consume fuel across multiple receipts. Existing trip distances are included regardless of their old manual receipt selection; stored history is retained. Exhausted receipts have zero remaining litres. Fuel used beyond recorded purchases remains visible in the vehicle overdrawn warning and is allocated when another receipt is added.


Super administrators can connect personal OneDrive from the Receipts screen. Select **Connect OneDrive**, sign in to Microsoft, and approve file access. Once connected, new receipt uploads are stored under `Quintyne Realty/<year>/<category>/<MM - Month>` in OneDrive. Existing files keep their original storage location. See the backend README for Microsoft app registration and callback settings.

OneDrive year and month folders use the reviewed receipt date, not the upload date. For example, a gas receipt dated October 12, 2026 is stored under `Quintyne Realty/2026/Gas/10 - October`. Missing folders are created automatically during upload; existing files are not moved.


## OneDrive trip spreadsheet

Each saved trip updates one app-managed `Trip Log <year>.csv` spreadsheet in `Quintyne Realty/<year>`. CSV opens in Excel. The log includes all non-deleted trips across vehicles and months for that calendar year, with date, vehicle, business/personal type, From, To, kilometres, estimated litres used, notes, and a stable trip ID. The first upload uses a temporary unique filename, then renames the managed file to `Trip Log <year>.csv`. Existing name conflicts are reported without overwriting another file. Later updates reuse the same OneDrive file ID.

The spreadsheet is rebuilt from saved trip records, so retries do not duplicate rows. It is a generated report; make corrections in the app because later syncs replace its contents. If OneDrive is disconnected or an update fails, the trip remains saved and the form shows a retry action. `POST /vehicles/{vehicle_id}/trips/{trip_id}/sync-spreadsheet` retries without creating another trip. Concurrent updates use a shared MongoDB lease. Receipt folders remain organized by year/category/month; each annual trip log stays directly in its year folder.
