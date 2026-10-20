import type { Meta, StoryObj } from "@storybook/react-vite";
import { BoldIcon, InfoIcon, ItalicIcon, PlusIcon, RocketIcon } from "lucide-react";
import { useId } from "react";

import { Alert, AlertDescription, AlertTitle } from "../primitives/alert/alert";
import { Badge } from "../primitives/badge/badge";
import { Button } from "../primitives/button/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../primitives/card/card";
import { Checkbox } from "../primitives/checkbox/checkbox";
import { Input } from "../primitives/input/input";
import { Label } from "../primitives/label/label";
import { Progress, ProgressLabel, ProgressValue } from "../primitives/progress/progress";
import { RadioGroup, RadioGroupItem } from "../primitives/radio-group/radio-group";
import { Slider } from "../primitives/slider/slider";
import { Spinner } from "../primitives/spinner/spinner";
import { StatusDot } from "../primitives/status-dot/status-dot";
import { Switch } from "../primitives/switch/switch";
import { Tabs, TabsList, TabsTrigger } from "../primitives/tabs/tabs";
import { Toggle } from "../primitives/toggle/toggle";

const meta = {
  title: "Theme",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Surface tokens paired with the foreground meant to sit on them. */
const pairs = [
  ["background", "foreground"],
  ["card", "card-foreground"],
  ["popover", "popover-foreground"],
  ["primary", "primary-foreground"],
  ["secondary", "secondary-foreground"],
  ["muted", "muted-foreground"],
  ["accent", "accent-foreground"],
  ["destructive", "primary-foreground"],
  ["success", "success-foreground"],
  ["warning", "warning-foreground"],
  ["sidebar", "sidebar-foreground"],
  ["sidebar-primary", "sidebar-primary-foreground"],
  ["sidebar-accent", "sidebar-accent-foreground"],
] as const;

const lines = ["border", "input", "ring", "sidebar-border"] as const;
const charts = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const;

function Tokens() {
  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h2 className="text-sm font-medium">Surfaces</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
          {pairs.map(([bg, fg]) => (
            <div
              key={bg}
              className="grid h-20 content-between rounded-lg p-3 text-xs ring-1 ring-foreground/10"
              style={{ background: `var(--${bg})`, color: `var(--${fg})` }}
            >
              <span className="text-base font-medium">Aa</span>
              <span>{bg}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-2">
        <h2 className="text-sm font-medium">Lines</h2>
        <div className="flex flex-wrap gap-3">
          {lines.map((name) => (
            <div key={name} className="grid w-32 gap-1 text-xs text-muted-foreground">
              <div
                className="h-10 rounded-lg border-2 bg-background"
                style={{ borderColor: `var(--${name})` }}
              />
              {name}
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-2">
        <h2 className="text-sm font-medium">Charts</h2>
        <div className="flex flex-wrap gap-3">
          {charts.map((name) => (
            <div key={name} className="grid w-20 gap-1 text-xs text-muted-foreground">
              <div className="h-10 rounded-lg" style={{ background: `var(--${name})` }} />
              {name}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/** One of every color-bearing control, to judge the theme at a glance. */
function Specimen() {
  const id = useId();
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2">
        <Button>
          <RocketIcon data-icon="inline-start" />
          Default
        </Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="link">Link</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="success">Running</Badge>
        <Badge variant="warning">
          <Spinner />
          Deploying
        </Badge>
        <Badge variant="destructive">Failed</Badge>
        <Badge variant="muted">Stopped</Badge>
        <Badge>Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="outline">
          <StatusDot tone="success" pulse />
          Live
        </Badge>
        <Badge variant="ghost">Ghost</Badge>
        <Badge variant="link">Link</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-6">
        <Tabs defaultValue="services">
          <TabsList>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs defaultValue="services">
          <TabsList variant="line">
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-1">
          <Toggle aria-label="Bold" defaultPressed>
            <BoldIcon />
          </Toggle>
          <Toggle aria-label="Italic" variant="outline">
            <ItalicIcon />
          </Toggle>
        </div>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>New preview environment</CardTitle>
            <CardDescription>Spin up a copy of production from a branch.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-branch`}>Branch</Label>
              <Input id={`${id}-branch`} defaultValue="feat/plum-orchid" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`${id}-sleep`}>Sleep when idle</Label>
              <Switch id={`${id}-sleep`} defaultChecked />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id={`${id}-snapshot`} defaultChecked />
              <Label htmlFor={`${id}-snapshot`}>Copy database snapshot</Label>
            </div>
            <RadioGroup defaultValue="small" aria-label="Instance size" className="flex gap-4">
              {["small", "medium", "large"].map((size) => (
                <div key={size} className="flex items-center gap-2">
                  <RadioGroupItem id={`${id}-${size}`} value={size} />
                  <Label htmlFor={`${id}-${size}`} className="capitalize">
                    {size}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <Slider defaultValue={[40]} aria-label="Replicas" />
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
        <div className="grid content-start gap-3">
          <Alert>
            <InfoIcon />
            <AlertTitle>Preview environments are on</AlertTitle>
            <AlertDescription>
              Every pull request gets its own copy of this project.
            </AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <InfoIcon />
            <AlertTitle>Deploy failed</AlertTitle>
            <AlertDescription>The cron service exited with code 1.</AlertDescription>
          </Alert>
          <p className="text-sm">
            Body text with <span className="text-muted-foreground">muted text</span> and{" "}
            <a href="#theme" className="text-primary underline-offset-4 hover:underline">
              a link
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

export const Colors: Story = { render: () => <Tokens /> };

export const Components: Story = { render: () => <Specimen /> };

/** Light and dark next to each other. Use with the toolbar theme set to light. */
export const LightAndDark: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <div className="grid lg:grid-cols-2">
      <div className="bg-background p-6 text-foreground">
        <Specimen />
      </div>
      <div className="dark bg-background p-6 text-foreground">
        <Specimen />
      </div>
    </div>
  ),
};
