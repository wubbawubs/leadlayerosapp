import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";

import appCss from "../styles.css?url";
import { supabase } from "@/integrations/supabase/client";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background bg-blueprint px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-8xl text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background bg-blueprint px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "LeadLayer OS — Lead growth infrastructure for service businesses" },
      {
        name: "description",
        content:
          "LeadLayer OS connects search, your website and lead tracking into one system — built to deliver qualified enquiries every single month.",
      },
      { property: "og:type", content: "website" },
      {
        property: "og:title",
        content: "LeadLayer OS — Lead growth infrastructure for service businesses",
      },
      {
        property: "og:description",
        content:
          "LeadLayer OS connects search, your website and lead tracking into one system — built to deliver qualified enquiries every single month.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:title",
        content: "LeadLayer OS — Lead growth infrastructure for service businesses",
      },
      {
        name: "twitter:description",
        content:
          "LeadLayer OS connects search, your website and lead tracking into one system — built to deliver qualified enquiries every single month.",
      },
      { name: "theme-color", content: "#0D0E10" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "LeadLayer" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap",
      },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/leadlayer-mark.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        {/* Apply saved theme before React hydrates — prevents flash of wrong theme.
            Customer-facing routes (landing, auth, client portal, shared reports)
            always render the light paper surface, never the operator dark theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=location.pathname;if(p==='/'||/^\\/(client|login|signup|reset-password|portal|r)(\\/|$)/.test(p))return;var t=localStorage.getItem('ll-theme');if(t!=='light')document.documentElement.classList.add('dark');}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AuthInvalidator() {
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      router.invalidate();
      queryClient.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router, queryClient]);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthInvalidator />
      <Outlet />
    </QueryClientProvider>
  );
}
