"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";

export function Authentication({
  children,
}: {
  children: (user: User) => React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Magic link form state
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Exchange code for session if redirected back from Supabase auth
  useEffect(() => {
    const code = searchParams.get("code");
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
        if (!error && data.user) {
          setUser(data.user);
          router.replace("/");
        }
        setLoading(false);
      });
    } else {
      supabase.auth.getUser().then(({ data: { user } }) => {
        setUser(user);
        setLoading(false);
      });
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [searchParams, router]);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setMagicLinkSent(true);
    }
    setSending(false);
  };

  if (loading) {
    return (
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
    );
  }

  if (user) {
    return (
      <>
        <p className="text-sm text-zinc-500">
          Signed in as{" "}
          <span className="text-zinc-300">{user.email}</span>
        </p>
        {children(user)}
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-300 transition-colors"
        >
          Log out
        </button>
      </>
    );
  }

  if (magicLinkSent) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-8 py-6 text-center">
          <p className="text-lg text-zinc-200">Check your email</p>
          <p className="mt-2 text-sm text-zinc-500">
            We sent a magic link to{" "}
            <span className="text-zinc-300">{email}</span>
          </p>
        </div>
        <button
          onClick={() => {
            setMagicLinkSent(false);
            setEmail("");
          }}
          className="text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-300 transition-colors"
        >
          Try a different email
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleMagicLink}
      className="flex flex-col items-center gap-4 w-full max-w-sm"
    >
      <input
        type="email"
        placeholder="Enter your email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-center text-white placeholder-zinc-600 outline-none focus:border-zinc-600 transition-colors"
      />
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
      <button
        type="submit"
        disabled={sending}
        className="w-full rounded-full bg-white px-8 py-3 text-lg font-semibold text-black transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
      >
        {sending ? "Sending..." : "Sign in with Magic Link"}
      </button>
    </form>
  );
}
