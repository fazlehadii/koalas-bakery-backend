import { createClient } from "@supabase/supabase-js";
import { Context } from "hono";
import { Env } from "../src/types/types";

export const getDB = (c: Context<Env>) => {
  return createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
};
