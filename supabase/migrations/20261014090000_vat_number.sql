-- A business's VAT registration number (VRN), stored as the 9 digits HMRC's
-- MTD VAT API expects (no "GB" prefix or spaces). Check digits are validated
-- in the app.
ALTER TABLE public.accounting_tenants
    ADD COLUMN vat_number VARCHAR(9) CHECK (vat_number IS NULL OR vat_number ~ '^[0-9]{9}$');
