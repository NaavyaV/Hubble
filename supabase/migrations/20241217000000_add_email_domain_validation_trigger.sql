-- Function to validate email domain matches college
CREATE OR REPLACE FUNCTION validate_profile_email_domain()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
  college_domain TEXT;
BEGIN
  -- Get the user's email from auth.users
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = NEW.id;
  
  -- Get the college's email domain
  SELECT email_domain INTO college_domain
  FROM colleges
  WHERE id = NEW.college_id;
  
  -- If college_domain is not found, raise error
  IF college_domain IS NULL THEN
    RAISE EXCEPTION 'Invalid college_id: College not found';
  END IF;
  
  -- Validate email domain
  IF user_email IS NULL OR NOT user_email ILIKE '%@' || college_domain THEN
    RAISE EXCEPTION 'Email domain does not match college. Expected @%, got %', 
      college_domain, user_email;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on profiles INSERT
CREATE TRIGGER check_email_domain_before_insert
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION validate_profile_email_domain();





