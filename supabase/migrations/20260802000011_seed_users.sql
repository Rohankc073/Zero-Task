-- 1. Purge all existing users
DELETE FROM auth.users;

-- 2. Seed the 4 predefined accounts using an anonymous block
DO $$
DECLARE
    founder_id UUID := gen_random_uuid();
    dept_head_id UUID := gen_random_uuid();
    manager_id UUID := gen_random_uuid();
    employee_id UUID := gen_random_uuid();
    default_password TEXT := 'Test@123';
BEGIN
    -- Insert Founder
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, 
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    VALUES (
        '00000000-0000-0000-0000-000000000000', founder_id, 'authenticated', 'authenticated', 'f@gmail.com', extensions.crypt(default_password, extensions.gen_salt('bf')), now(), 
        '{"provider":"email","providers":["email"]}', '{"full_name":"Founder Account", "role":"Founder"}', now(), now()
    );

    -- Insert Department Head
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, 
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    VALUES (
        '00000000-0000-0000-0000-000000000000', dept_head_id, 'authenticated', 'authenticated', 'd@gmail.com', extensions.crypt(default_password, extensions.gen_salt('bf')), now(), 
        '{"provider":"email","providers":["email"]}', '{"full_name":"Dept Head Account", "role":"Department Head"}', now(), now()
    );

    -- Insert Manager
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, 
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    VALUES (
        '00000000-0000-0000-0000-000000000000', manager_id, 'authenticated', 'authenticated', 'm@gmail.com', extensions.crypt(default_password, extensions.gen_salt('bf')), now(), 
        '{"provider":"email","providers":["email"]}', '{"full_name":"Manager Account", "role":"Manager"}', now(), now()
    );

    -- Insert Employee
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, 
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    VALUES (
        '00000000-0000-0000-0000-000000000000', employee_id, 'authenticated', 'authenticated', 'e@gmail.com', extensions.crypt(default_password, extensions.gen_salt('bf')), now(), 
        '{"provider":"email","providers":["email"]}', '{"full_name":"Employee Account", "role":"Employee"}', now(), now()
    );

    -- 3. The trigger 'handle_new_user' will have automatically inserted these into public.users.
    -- We just need to update 'is_approved' to true so they can log in instantly.
    UPDATE public.users SET is_approved = true WHERE id IN (founder_id, dept_head_id, manager_id, employee_id);

END $$;
