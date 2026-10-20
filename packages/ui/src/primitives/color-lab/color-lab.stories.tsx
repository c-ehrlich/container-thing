/**
 * Color exploration spike. Each theme only overrides the shadcn CSS variables on a wrapper element,
 * so nothing outside this file changes. Delete this folder to get rid of it.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ActivityIcon,
  BellIcon,
  BoxIcon,
  GitBranchIcon,
  InfoIcon,
  KeyRoundIcon,
  LayersIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RocketIcon,
  RotateCwIcon,
  SearchIcon,
  SettingsIcon,
  SquareTerminalIcon,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "../alert/alert";
import { Avatar, AvatarFallback } from "../avatar/avatar";
import { Badge } from "../badge/badge";
import { Button } from "../button/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../card/card";
import { Checkbox } from "../checkbox/checkbox";
import { Input } from "../input/input";
import { Label } from "../label/label";
import { Progress, ProgressLabel, ProgressValue } from "../progress/progress";
import { Spinner } from "../spinner/spinner";
import { Switch } from "../switch/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../table/table";
import { Tabs, TabsList, TabsTrigger } from "../tabs/tabs";

// ---------------------------------------------------------------------------------------------
// Theme generator
// ---------------------------------------------------------------------------------------------

type Oklch = { l: number; c: number; h: number };
type Vars = Record<`--${string}`, string>;

type ThemeSpec = {
  name: string;
  idea: string;
  /** Hue and chroma used to tint every gray. Chroma 0 = pure neutral. */
  neutral: { h: number; c: number };
  /** Light-mode page background lightness. Below 1 = lower-contrast, off-white page. */
  bg?: number;
  /** Dark-mode page background lightness. */
  darkBg?: number;
  /** "raised": cards are lighter than the page (only visible when bg < 1). */
  surface?: "flat" | "raised";
  primary: Oklch;
  primaryDark?: Oklch;
  /** "tonal" = pale version of the primary hue; an object = pale version of another hue. */
  secondary?: "neutral" | "tonal" | { hue: number; chroma: number };
  /** Hover/selected color in menus, lists etc. */
  accent?: "neutral" | "tonal";
  sidebar?: "neutral" | "tinted" | "inverse";
  chart?: "ramp" | "spread";
  overrides?: { light?: Vars; dark?: Vars };
};

const fmt = (l: number, c: number, h: number) =>
  `oklch(${l.toFixed(3)} ${Math.max(0, c).toFixed(3)} ${h})`;
const col = (o: Oklch) => fmt(o.l, o.c, o.h);
/** Readable text color on top of a filled color. */
const textOn = (o: Oklch) =>
  o.l > 0.72 ? fmt(0.2, Math.min(o.c * 0.3, 0.04), o.h) : fmt(0.99, 0.005, o.h);
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function buildVars(s: ThemeSpec, mode: "light" | "dark"): Vars {
  const p = mode === "light" ? s.primary : (s.primaryDark ?? darken(s.primary));
  const dark = mode === "dark";
  const base = dark ? (s.darkBg ?? 0.16) : (s.bg ?? 1);
  const mul = dark ? 1.5 : 1;
  const n = (l: number, m = 1) => fmt(l, s.neutral.c * m * mul, s.neutral.h);

  const background = n(base);
  const card = dark
    ? n(base + 0.045)
    : s.surface === "raised" && base < 1
      ? n(Math.min(1, base + 0.03), 0.4)
      : n(base);
  const foreground = dark ? n(0.97, 0.4) : n(0.18, 2.5);
  const muted = dark ? n(base + 0.1) : n(base - 0.035);
  const mutedForeground = dark ? n(0.71) : n(0.5, 2);
  const border = dark ? n(base + 0.12) : n(base - 0.08);
  const input = dark ? n(base + 0.16) : n(base - 0.08);

  const tonal = (h: number, c: number) =>
    dark
      ? {
          bg: fmt(base + 0.12, Math.min(c * 0.35, 0.07), h),
          fg: fmt(0.88, Math.min(c * 0.6, 0.12), h),
        }
      : { bg: fmt(0.94, Math.min(c * 0.3, 0.06), h), fg: fmt(0.42, Math.min(c * 0.9, 0.16), h) };

  const secondary =
    s.secondary === "tonal"
      ? tonal(p.h, p.c)
      : typeof s.secondary === "object"
        ? tonal(s.secondary.hue, s.secondary.chroma * 2.5)
        : { bg: dark ? n(base + 0.1) : n(base - 0.04), fg: foreground };

  const accentTonal = dark
    ? { bg: fmt(base + 0.09, Math.min(p.c * 0.3, 0.06), p.h), fg: fmt(0.93, 0.04, p.h) }
    : { bg: fmt(0.955, Math.min(p.c * 0.25, 0.05), p.h), fg: fmt(0.38, Math.min(p.c, 0.15), p.h) };
  const accent = s.accent === "tonal" ? accentTonal : { bg: muted, fg: foreground };

  const chart =
    s.chart === "spread"
      ? [0, 70, 150, 210, 290].map((d) => fmt(dark ? 0.7 : 0.64, 0.15, (p.h + d) % 360))
      : [0.85, 0.72, 0.6, 0.5, 0.4].map((l) => fmt(dark ? l + 0.05 : l, p.c * 0.9, p.h));

  const inverseC = Math.max(s.neutral.c * 3, 0.015);
  const sidebar =
    s.sidebar === "inverse"
      ? {
          bg: fmt(dark ? base - 0.04 : 0.22, inverseC, s.neutral.h),
          fg: fmt(0.95, 0.01, s.neutral.h),
          accent: fmt(dark ? base + 0.06 : 0.3, inverseC, s.neutral.h),
          accentFg: fmt(0.98, 0.01, s.neutral.h),
          border: fmt(dark ? base + 0.04 : 0.3, inverseC, s.neutral.h),
        }
      : s.sidebar === "tinted"
        ? {
            bg: dark
              ? fmt(base + 0.035, p.c * 0.15, p.h)
              : fmt(0.965, Math.min(p.c * 0.15, 0.03), p.h),
            fg: foreground,
            accent: accentTonal.bg,
            accentFg: accentTonal.fg,
            border: dark
              ? fmt(base + 0.1, p.c * 0.15, p.h)
              : fmt(0.91, Math.min(p.c * 0.15, 0.03), p.h),
          }
        : {
            bg: dark ? n(base + 0.035) : n(Math.max(0, base - 0.015)),
            fg: foreground,
            accent: accent.bg,
            accentFg: accent.fg,
            border,
          };

  const vars: Vars = {
    "--background": background,
    "--foreground": foreground,
    "--card": card,
    "--card-foreground": foreground,
    "--popover": card,
    "--popover-foreground": foreground,
    "--primary": col(p),
    "--primary-foreground": textOn(p),
    "--secondary": secondary.bg,
    "--secondary-foreground": secondary.fg,
    "--muted": muted,
    "--muted-foreground": mutedForeground,
    "--accent": accent.bg,
    "--accent-foreground": accent.fg,
    "--border": border,
    "--input": input,
    "--ring": col(p),
    "--chart-1": chart[0]!,
    "--chart-2": chart[1]!,
    "--chart-3": chart[2]!,
    "--chart-4": chart[3]!,
    "--chart-5": chart[4]!,
    "--sidebar": sidebar.bg,
    "--sidebar-foreground": sidebar.fg,
    "--sidebar-primary": col(p),
    "--sidebar-primary-foreground": textOn(p),
    "--sidebar-accent": sidebar.accent,
    "--sidebar-accent-foreground": sidebar.accentFg,
    "--sidebar-border": sidebar.border,
    "--sidebar-ring": col(p),
  };
  return { ...vars, ...(dark ? s.overrides?.dark : s.overrides?.light) };
}

/** Default dark-mode primary: a little lighter so it doesn't sink into the dark page. */
function darken(p: Oklch): Oklch {
  return { l: p.l < 0.62 ? clamp(p.l + 0.08, 0, 0.7) : p.l, c: p.c, h: p.h };
}

// ---------------------------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------------------------

const themes = {
  baseline: null,
  indigoSlate: {
    name: "Indigo + slate",
    idea: "Classic SaaS: cool slate-tinted grays and an indigo primary. Secondary stays gray.",
    neutral: { h: 255, c: 0.012 },
    primary: { l: 0.51, c: 0.23, h: 277 },
  },
  indigoTonal: {
    name: "Indigo, tonal secondary",
    idea: "Same as Indigo + slate, but secondary and hover states are a pale indigo instead of gray.",
    neutral: { h: 255, c: 0.012 },
    primary: { l: 0.51, c: 0.23, h: 277 },
    secondary: "tonal",
    accent: "tonal",
  },
  violet: {
    name: "Violet (Railway-ish)",
    idea: "Off-white lavender page, white cards, violet primary, tinted sidebar.",
    neutral: { h: 290, c: 0.01 },
    bg: 0.982,
    surface: "raised",
    primary: { l: 0.55, c: 0.24, h: 293 },
    secondary: "tonal",
    accent: "tonal",
    sidebar: "tinted",
  },
  stoneTerracotta: {
    name: "Warm stone + terracotta",
    idea: "Warm, low-contrast stone background with white cards. Earthy terracotta for actions.",
    neutral: { h: 70, c: 0.008 },
    bg: 0.972,
    surface: "raised",
    primary: { l: 0.6, c: 0.16, h: 40 },
  },
  paperInk: {
    name: "Paper + ink",
    idea: "Cream paper background and deep ink-blue primary. Quiet and editorial.",
    neutral: { h: 85, c: 0.015 },
    bg: 0.965,
    darkBg: 0.2,
    surface: "raised",
    primary: { l: 0.35, c: 0.09, h: 260 },
    primaryDark: { l: 0.78, c: 0.09, h: 255 },
  },
  emeraldTonal: {
    name: "Emerald, tonal",
    idea: "Emerald primary with a mint secondary. Friendly, 'all systems go'.",
    neutral: { h: 160, c: 0.006 },
    primary: { l: 0.6, c: 0.15, h: 162 },
    secondary: "tonal",
    accent: "tonal",
  },
  ocean: {
    name: "Ocean blue (Material-ish)",
    idea: "Blue primary, pale-blue 'filled tonal' secondary, tinted sidebar, slightly off-white page.",
    neutral: { h: 240, c: 0.01 },
    bg: 0.982,
    surface: "raised",
    primary: { l: 0.55, c: 0.2, h: 258 },
    secondary: "tonal",
    accent: "tonal",
    sidebar: "tinted",
  },
  tealCoral: {
    name: "Teal + coral",
    idea: "Two colors: teal for primary actions, a soft coral for secondary ones.",
    neutral: { h: 200, c: 0.008 },
    primary: { l: 0.56, c: 0.11, h: 192 },
    secondary: { hue: 30, chroma: 0.04 },
    accent: "tonal",
    chart: "spread",
  },
  amberHazard: {
    name: "Amber hazard",
    idea: "Shipping-container yellow with black text, plus a dark sidebar. Loud but memorable.",
    neutral: { h: 80, c: 0.01 },
    primary: { l: 0.82, c: 0.16, h: 82 },
    sidebar: "inverse",
  },
  blueOrange: {
    name: "Blue + orange",
    idea: "Complementary pair: blue primary, pale orange secondary. Charts use spread hues.",
    neutral: { h: 250, c: 0.008 },
    primary: { l: 0.55, c: 0.21, h: 260 },
    secondary: { hue: 55, chroma: 0.05 },
    chart: "spread",
  },
  monoOrange: {
    name: "Mono + one orange",
    idea: "Keeps today's pure grays and just makes primary a vivid orange (Linear/Raycast feel).",
    neutral: { h: 0, c: 0 },
    primary: { l: 0.66, c: 0.2, h: 42 },
  },
  acidLime: {
    name: "Acid lime dev-tool",
    idea: "Electric lime on near-black. Dark sidebar even in light mode. Best in dark mode.",
    neutral: { h: 130, c: 0.005 },
    darkBg: 0.14,
    primary: { l: 0.86, c: 0.2, h: 128 },
    primaryDark: { l: 0.9, c: 0.21, h: 128 },
    sidebar: "inverse",
  },
  mintGraphite: {
    name: "Mint on graphite",
    idea: "Supabase-ish mint primary with dark text, graphite sidebar, tonal secondary.",
    neutral: { h: 165, c: 0.01 },
    primary: { l: 0.76, c: 0.15, h: 163 },
    secondary: "tonal",
    accent: "tonal",
    sidebar: "inverse",
  },
  rose: {
    name: "Rose",
    idea: "Rose primary with blush-tinted secondary. Warm and a bit playful.",
    neutral: { h: 10, c: 0.008 },
    bg: 0.99,
    surface: "raised",
    primary: { l: 0.59, c: 0.22, h: 12 },
    secondary: "tonal",
    accent: "tonal",
  },
  plum: {
    name: "Plum",
    idea: "Deep plum primary with lilac-tinted grays and sidebar. Rich, low-key.",
    neutral: { h: 310, c: 0.015 },
    bg: 0.975,
    surface: "raised",
    primary: { l: 0.45, c: 0.17, h: 312 },
    primaryDark: { l: 0.68, c: 0.17, h: 312 },
    secondary: "tonal",
    accent: "tonal",
    sidebar: "tinted",
  },
  plumGraySecondary: {
    name: "Plum · gray secondary",
    idea: "Plum is only used for primary actions. Secondary, hovers and the sidebar stay lilac-gray, on a white page.",
    neutral: { h: 310, c: 0.01 },
    primary: { l: 0.45, c: 0.17, h: 312 },
    primaryDark: { l: 0.68, c: 0.17, h: 312 },
  },
  plumAubergine: {
    name: "Plum · aubergine sidebar",
    idea: "Dark aubergine sidebar in both modes, plum primary, pale-plum secondary.",
    neutral: { h: 312, c: 0.02 },
    bg: 0.985,
    surface: "raised",
    primary: { l: 0.47, c: 0.18, h: 312 },
    primaryDark: { l: 0.68, c: 0.17, h: 312 },
    secondary: "tonal",
    accent: "tonal",
    sidebar: "inverse",
  },
  plumGold: {
    name: "Plum · gold",
    idea: "Plum primary with a warm gold secondary and multi-hue charts. Two colors, a bit regal.",
    neutral: { h: 310, c: 0.012 },
    bg: 0.98,
    surface: "raised",
    primary: { l: 0.45, c: 0.17, h: 312 },
    primaryDark: { l: 0.68, c: 0.17, h: 312 },
    secondary: { hue: 80, chroma: 0.05 },
    accent: "tonal",
    sidebar: "tinted",
    chart: "spread",
  },
  plumDusty: {
    name: "Plum · dusty, low contrast",
    idea: "Muted, dustier plum on a lilac-gray page. Softer text and borders everywhere.",
    neutral: { h: 315, c: 0.02 },
    bg: 0.96,
    darkBg: 0.2,
    surface: "raised",
    primary: { l: 0.52, c: 0.11, h: 318 },
    primaryDark: { l: 0.7, c: 0.1, h: 318 },
    secondary: "tonal",
    accent: "tonal",
    sidebar: "tinted",
    overrides: {
      light: { "--foreground": fmt(0.32, 0.03, 315), "--card-foreground": fmt(0.32, 0.03, 315) },
      dark: { "--foreground": fmt(0.9, 0.02, 315), "--card-foreground": fmt(0.9, 0.02, 315) },
    },
  },
  plumOrchid: {
    name: "Plum · vivid orchid",
    idea: "Brighter, pinker orchid primary on a white page. More energy, less moody.",
    neutral: { h: 320, c: 0.008 },
    primary: { l: 0.55, c: 0.22, h: 322 },
    primaryDark: { l: 0.7, c: 0.2, h: 322 },
    secondary: "tonal",
    accent: "tonal",
  },
  forestSage: {
    name: "Forest + sage",
    idea: "Sage-green page, deep forest primary. Calm, natural, lower contrast.",
    neutral: { h: 140, c: 0.02 },
    bg: 0.965,
    darkBg: 0.18,
    surface: "raised",
    primary: { l: 0.45, c: 0.1, h: 152 },
    primaryDark: { l: 0.7, c: 0.13, h: 152 },
    secondary: "tonal",
  },
  skySoft: {
    name: "Soft sky (low contrast)",
    idea: "Everything softened: blue-gray page, softer text, sky primary. Easy on the eyes.",
    neutral: { h: 235, c: 0.015 },
    bg: 0.97,
    darkBg: 0.21,
    surface: "raised",
    primary: { l: 0.62, c: 0.15, h: 235 },
    secondary: "tonal",
    accent: "tonal",
    overrides: {
      light: { "--foreground": fmt(0.3, 0.03, 245), "--card-foreground": fmt(0.3, 0.03, 245) },
      dark: { "--foreground": fmt(0.9, 0.02, 235), "--card-foreground": fmt(0.9, 0.02, 235) },
    },
  },
  tintedNeutrals: {
    name: "Tinted neutrals only",
    idea: "No colorful primary at all. Every gray gets a blue-ish tint, primary becomes navy-black.",
    neutral: { h: 265, c: 0.02 },
    primary: { l: 0.27, c: 0.06, h: 265 },
    primaryDark: { l: 0.9, c: 0.03, h: 265 },
  },
  navyCyan: {
    name: "Navy sidebar + cyan",
    idea: "Navy app chrome with a bright cyan primary. Very 'cloud console'.",
    neutral: { h: 255, c: 0.02 },
    bg: 0.985,
    surface: "raised",
    primary: { l: 0.62, c: 0.14, h: 222 },
    accent: "tonal",
    sidebar: "inverse",
    chart: "spread",
  },
} satisfies Record<string, ThemeSpec | null>;

type ThemeKey = keyof typeof themes;

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

function Themed(props: {
  theme: ThemeKey;
  mode: "light" | "dark";
  className?: string;
  children: ReactNode;
}) {
  const spec: ThemeSpec | null = themes[props.theme];
  const style = spec ? (buildVars(spec, props.mode) as CSSProperties) : undefined;
  return (
    <div style={style} className={`bg-background text-foreground ${props.className ?? ""}`}>
      {props.children}
    </div>
  );
}

const services = [
  { name: "api", image: "ghcr.io/acme/api:4f2c1a", status: "running", cpu: 34 },
  { name: "worker", image: "ghcr.io/acme/worker:4f2c1a", status: "building", cpu: 0 },
  { name: "postgres", image: "postgres:17", status: "running", cpu: 12 },
  { name: "cron", image: "ghcr.io/acme/cron:9b0e77", status: "failed", cpu: 0 },
] as const;

function StatusBadge(props: { status: "running" | "building" | "failed" | "sleeping" }) {
  if (props.status === "running") return <Badge>Running</Badge>;
  if (props.status === "failed") return <Badge variant="destructive">Failed</Badge>;
  if (props.status === "sleeping") return <Badge variant="outline">Sleeping</Badge>;
  return (
    <Badge variant="secondary">
      <Spinner />
      Building 14s
    </Badge>
  );
}

function Dashboard() {
  return (
    <div className="flex min-h-svh">
      <aside className="flex w-56 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground">
        <div className="flex items-center gap-2 px-2 pt-1">
          <div className="grid size-7 place-content-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <BoxIcon className="size-4" />
          </div>
          <span className="font-semibold">Console</span>
        </div>
        <nav className="grid gap-0.5 text-sm">
          {[
            { icon: LayersIcon, label: "Projects", active: true },
            { icon: ActivityIcon, label: "Activity" },
            { icon: KeyRoundIcon, label: "Variables" },
            { icon: SquareTerminalIcon, label: "Logs" },
            { icon: SettingsIcon, label: "Settings" },
          ].map((item) => (
            <button
              type="button"
              key={item.label}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left ${
                item.active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "opacity-75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:opacity-100"
              }`}
            >
              <item.icon className="size-4" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="grid gap-1 text-sm">
          <p className="px-2 text-xs font-medium opacity-60">Environments</p>
          {["production", "staging", "pr-482"].map((env, i) => (
            <button
              type="button"
              key={env}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 opacity-80 hover:bg-sidebar-accent"
            >
              <span
                className={`size-2 rounded-full ${i === 2 ? "bg-chart-3" : "bg-sidebar-primary"}`}
              />
              {env}
            </button>
          ))}
        </div>
        <div className="mt-auto flex items-center gap-2 px-2 pb-1 text-sm">
          <Avatar className="size-7">
            <AvatarFallback>CE</AvatarFallback>
          </Avatar>
          <span className="truncate opacity-80">Christopher</span>
        </div>
      </aside>

      <main className="grid flex-1 content-start gap-6 p-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">acme / production</p>
            <h1 className="text-2xl font-semibold tracking-tight">acme-api</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <SearchIcon className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search services" className="w-52 pl-8" />
            </div>
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <BellIcon />
            </Button>
            <Button variant="outline">
              <SettingsIcon data-icon="inline-start" />
              Settings
            </Button>
            <Button variant="secondary">
              <RotateCwIcon data-icon="inline-start" />
              Redeploy
            </Button>
            <Button>
              <RocketIcon data-icon="inline-start" />
              Deploy
            </Button>
          </div>
        </header>

        <Tabs defaultValue="services">
          <TabsList>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="deployments">Deployments</TabsTrigger>
            <TabsTrigger value="variables">Variables</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
          </TabsList>
        </Tabs>

        <Alert>
          <InfoIcon />
          <AlertTitle>Preview environments are on</AlertTitle>
          <AlertDescription>
            Every pull request gets its own copy of this project. They sleep after 30 minutes idle.
          </AlertDescription>
        </Alert>

        <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
          <div className="grid content-start gap-4 sm:grid-cols-2">
            {services.map((service) => (
              <Card key={service.name} size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BoxIcon className="size-4 text-primary" />
                    {service.name}
                  </CardTitle>
                  <CardDescription className="truncate font-mono text-xs">
                    {service.image}
                  </CardDescription>
                  <CardAction>
                    <StatusBadge status={service.status} />
                  </CardAction>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>CPU</span>
                    <span className="tabular-nums">{service.cpu}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-chart-2" style={{ width: `${service.cpu}%` }} />
                  </div>
                </CardContent>
                <CardFooter className="gap-2">
                  <Button size="sm" variant={service.status === "failed" ? "default" : "outline"}>
                    {service.status === "failed" ? "Retry" : "Logs"}
                  </Button>
                  <Button size="sm" variant="ghost">
                    <GitBranchIcon data-icon="inline-start" />
                    main
                  </Button>
                  <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label="More">
                    <MoreHorizontalIcon />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>New preview environment</CardTitle>
              <CardDescription>Spin up a copy of production from a branch.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="branch">Branch</Label>
                <Input id="branch" defaultValue="feat/color-themes" />
              </div>
              <label className="flex items-center justify-between gap-2 text-sm">
                Sleep when idle
                <Switch defaultChecked />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox defaultChecked />
                Copy database snapshot
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox />
                Seed with fixtures
              </label>
              <Progress value={62}>
                <ProgressLabel>Building image</ProgressLabel>
                <ProgressValue />
              </Progress>
            </CardContent>
            <CardFooter className="gap-2">
              <Button className="flex-1">
                <PlusIcon data-icon="inline-start" />
                Create
              </Button>
              <Button variant="secondary" className="flex-1">
                Cancel
              </Button>
            </CardFooter>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent deployments</CardTitle>
            <CardAction>
              <Button variant="link" size="sm">
                View all
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Commit</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(
                  [
                    ["4f2c1a", "Add color lab stories", "building", "just now"],
                    ["9b0e77", "Fix cron schedule parsing", "failed", "12 min ago"],
                    ["e81d03", "Bump postgres to 17", "running", "2 h ago"],
                    ["77aa10", "Spin down idle previews", "sleeping", "yesterday"],
                  ] as const
                ).map(([sha, message, status, when]) => (
                  <TableRow key={sha}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        {sha}
                      </Badge>
                    </TableCell>
                    <TableCell>{message}</TableCell>
                    <TableCell>
                      <StatusBadge status={status} />
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{when}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Palette />
      </main>
    </div>
  );
}

const swatches = [
  "background",
  "card",
  "muted",
  "border",
  "primary",
  "secondary",
  "accent",
  "destructive",
  "sidebar",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
];

function Palette() {
  return (
    <section className="grid gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">Tokens</h2>
      <div className="flex flex-wrap gap-3">
        {swatches.map((name) => (
          <div key={name} className="grid w-20 gap-1 text-xs">
            <div
              className="h-10 rounded-md ring-1 ring-foreground/10"
              style={{ background: `var(--${name})` }}
            />
            <span className="text-muted-foreground">{name}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button>Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="link">Link</Button>
        <Badge>Badge</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge variant="destructive">Destructive</Badge>
      </div>
    </section>
  );
}

function Tile(props: { theme: ThemeKey; mode: "light" | "dark" }) {
  const spec: ThemeSpec | null = themes[props.theme];
  return (
    <Themed
      theme={props.theme}
      mode={props.mode}
      className="grid gap-3 rounded-xl p-4 ring-1 ring-foreground/10"
    >
      <div>
        <p className="font-medium">{spec?.name ?? "Current (styles.css)"}</p>
        <p className="text-xs text-muted-foreground">
          {spec?.idea ?? "Whatever styles.css ships right now (Plum · orchid)."}
        </p>
      </div>
      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BoxIcon className="size-4 text-primary" />
            api
          </CardTitle>
          <CardAction>
            <StatusBadge status="running" />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button size="sm">Deploy</Button>
          <Button size="sm" variant="secondary">
            Redeploy
          </Button>
          <Button size="sm" variant="outline">
            Logs
          </Button>
          <Switch size="sm" defaultChecked className="ml-auto" />
        </CardContent>
      </Card>
      <div className="flex gap-1">
        {["primary", "secondary", "accent", "muted", "sidebar", "chart-2", "chart-4"].map((t) => (
          <div
            key={t}
            className="h-4 flex-1 rounded-sm ring-1 ring-foreground/10"
            style={{ background: `var(--${t})` }}
          />
        ))}
      </div>
    </Themed>
  );
}

// ---------------------------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------------------------

const meta = {
  title: "Color Lab",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const modeOf = (globals: Record<string, unknown>) => (globals.theme === "dark" ? "dark" : "light");

const overview = (keys: ThemeKey[]): Story => ({
  render: (_, { globals }) => (
    <div className="grid gap-4 bg-background p-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {keys.map((key) => (
        <Tile key={key} theme={key} mode={modeOf(globals)} />
      ))}
    </div>
  ),
});

export const Overview = overview(Object.keys(themes) as ThemeKey[]);
export const PlumOverview = {
  ...overview([
    "plum",
    "plumGraySecondary",
    "plumAubergine",
    "plumGold",
    "plumDusty",
    "plumOrchid",
  ]),
  name: "Plum · overview",
} satisfies Story;

const story = (theme: ThemeKey): Story => ({
  name: themes[theme]?.name ?? "Current (styles.css)",
  render: (_, { globals }) => (
    <Themed theme={theme} mode={modeOf(globals)}>
      <Dashboard />
    </Themed>
  ),
});

export const Baseline = story("baseline");
export const IndigoSlate = story("indigoSlate");
export const IndigoTonal = story("indigoTonal");
export const Violet = story("violet");
export const StoneTerracotta = story("stoneTerracotta");
export const PaperInk = story("paperInk");
export const EmeraldTonal = story("emeraldTonal");
export const Ocean = story("ocean");
export const TealCoral = story("tealCoral");
export const AmberHazard = story("amberHazard");
export const BlueOrange = story("blueOrange");
export const MonoOrange = story("monoOrange");
export const AcidLime = story("acidLime");
export const MintGraphite = story("mintGraphite");
export const Rose = story("rose");
export const Plum = story("plum");
export const PlumGraySecondary = story("plumGraySecondary");
export const PlumAubergine = story("plumAubergine");
export const PlumGold = story("plumGold");
export const PlumDusty = story("plumDusty");
export const PlumOrchid = story("plumOrchid");
export const ForestSage = story("forestSage");
export const SkySoft = story("skySoft");
export const TintedNeutrals = story("tintedNeutrals");
export const NavyCyan = story("navyCyan");
