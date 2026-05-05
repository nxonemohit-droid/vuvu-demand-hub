DELETE FROM public.demand_leads
WHERE (employer_name IS NULL OR employer_name = '')
   OR (source_url IS NULL AND contact_email IS NULL AND contact_phone IS NULL);