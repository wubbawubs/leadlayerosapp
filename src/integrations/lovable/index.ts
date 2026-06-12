import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

// Drop-in replacement for the old @lovable.dev/cloud-auth-js wrapper.
// Uses native Supabase OAuth — no external dependency needed.
export const lovable = {
  auth: {
    signInWithOAuth: async (
      provider: "google" | "apple" | "microsoft",
      opts?: SignInOptions,
    ) => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider as "google" | "apple",
        options: {
          redirectTo: opts?.redirect_uri ?? window.location.origin + "/dashboard",
          queryParams: opts?.extraParams,
        },
      });

      if (error) return { error, redirected: false };
      // Supabase OAuth always redirects — control never returns here
      return { redirected: true, error: null };
    },
  },
};
