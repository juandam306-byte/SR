// Este archivo se carga en el navegador mediante <script type="module">.
// La clave publicable puede estar aquí: las políticas RLS de Supabase limitan
// los datos que cada persona puede leer o modificar.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://dldryszmtvunrqzpnkgs.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable__qNTSQHoBi0LMgkFd4xFsA_FGhKaVjB';

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
