# FlowBulk Pro (Tauri + React)

Do build hote hain, ek hi code se:
- **customer** build: sirf Login + Image Generator (ye customers ko dena hai)
- **admin** build: Master Password + Admin Dashboard (ye sirf aapke paas rahe)

Master password app ke andar kahin nahi likha. Wo Supabase secret mein rehta hai aur server check karta hai.

## Folder structure
```
src/                 React UI (App.tsx = Login, Admin, Editor)
src-tauri/           Rust (folder save, Flow webview) + flow_driver.js
supabase/schema.sql  tables + RLS
supabase/functions/flowbulk/index.ts   server logic (login, license, download)
.github/workflows/build.yml            cloud mein Windows exe banata hai
```

## 1) Supabase setup
1. supabase.com par project banao.
2. SQL Editor mein `supabase/schema.sql` paste karke Run.
3. Supabase CLI se: `supabase login`, `supabase link --project-ref YOUR-REF`
4. `supabase functions deploy flowbulk --no-verify-jwt`
5. `supabase secrets set ADMIN_PASSWORD="apna-naya-lamba-password"`
   (optional) `supabase secrets set DOWNLOAD_BASE_URL="https://flowbulk.app/d"`
6. Function URL: `https://YOUR-REF.supabase.co/functions/v1/flowbulk`

## 2) Exe banana (ek tareeqa chuno)
**A. GitHub (asaan, kuch install nahi):** code ko private GitHub repo mein upload karo -> Settings > Secrets > Actions mein `VITE_FUNCTION_URL` daalo -> Actions > "Build FlowBulk Pro" > Run workflow -> 10-15 min baad Artifacts se `FlowBulkPro-customer` aur `FlowBulkPro-admin` (.exe) download karo.

**B. Apne Windows PC par:** Node 20, Rust (rustup), "Visual Studio Build Tools" (C++), WebView2 chahiye.
```
copy .env.example .env      (VITE_FUNCTION_URL bharo, VITE_MODE=customer)
npm install
npm run tauri build         -> src-tauri\target\release\flowbulk-pro.exe
```
Admin exe ke liye `.env` mein `VITE_MODE=admin` karke dobara build.

## 3) Customer ko dena
1. Customer exe ko Supabase Storage > bucket `releases` mein `FlowBulkPro-customer.exe` naam se upload karo.
2. Admin exe > Share Tool / Create User > Generate License. Download link + password dikhega (password sirf ek baar).
3. `flowbulk.app/d/...` chahiye to domain ka redirect `/d/*` -> `https://YOUR-REF.supabase.co/functions/v1/flowbulk/d/*` rakho aur `DOWNLOAD_BASE_URL` set karo.

## Branding
Admin > App Settings mein naam aur logo URL badlo. Sab customers ko agli baar app kholne par naya naam/logo dikhega (exe dobara banane ki zaroorat nahi).

## Istemal (customer)
Login -> "Open Flow" (pehli baar Google login + project + Image mode) -> Check -> .txt prompts + save folder -> Start Generate.
Sab generate hone ke baad 1.jpg, 2.jpg ... txt ki line order mein save hoti hain.
