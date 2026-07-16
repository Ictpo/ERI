# ERI Design System — build conventions

ERI (Engine for Reinert Insights) is a text-analysis app. These are its UI
primitives: shadcn/Radix-derived React components styled with Tailwind. All
exports live on `window.ERI`.

## Styling idiom — Tailwind utility classes

Components are pre-styled; you compose **layout** with Tailwind utility
classes (the same vocabulary the components use internally). There is no
separate theme object or style-prop system. The full compiled utility set is
in `_ds_bundle.css` (reachable from `styles.css`). Read `styles.css` and its
`@import` closure before styling.

Brand vocabulary actually used by these components:

| Concern | Classes / values |
|---|---|
| Primary accent | `indigo-600` (hover `indigo-700`) — buttons, active tabs, switch-on, slider fill |
| Neutrals | `slate-50/100/200/300/500/600/700/900` for surfaces, borders, text |
| Status | `emerald`/`green` (success), `amber` (warning), `red` (destructive), `indigo` (info) |
| Surface | white cards, `border border-slate-200`, `rounded-md`/`rounded-lg`, `shadow-sm` |
| Text | `text-sm` body, `text-slate-500` muted, `font-semibold` titles |
| Type family | Inter (shipped in `fonts/`, applied to `body`) |

## Component API — IMPORTANT

These are NOT full shadcn compounds. Most export a **single element**; only
some are compounds. Never assume sub-component names — check this list:

- **Single element (children only):** `Alert` (variant: default/warning/
  destructive/info — put a bold title `<div>` + body `<div>` inside; there is
  NO AlertTitle/AlertDescription), `Badge` (default/secondary/outline/success/
  warning/destructive), `Button`, `Input`, `Textarea`, `Label`, `Skeleton`,
  `Switch`, `Slider`.
- **Compounds:** `Card` (+ `CardHeader`, `CardTitle`, `CardDescription`,
  `CardContent`, `CardFooter`), `Dialog` (+ `DialogContent`, `DialogHeader`,
  `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogTrigger`,
  `DialogClose`), `Select` (+ `SelectTrigger`, `SelectValue`, `SelectContent`,
  `SelectItem`, `SelectGroup`, `SelectLabel`), `Tabs` (+ `TabsList`,
  `TabsTrigger`, `TabsContent`), `Tooltip` (+ `TooltipProvider`,
  `TooltipTrigger`, `TooltipContent`), `Toast` (+ `ToastProvider`,
  `ToastViewport`, `ToastTitle`, `ToastDescription`, `ToastClose`,
  `ToastAction`).

Read each component's `<Name>.d.ts` for its exact props.

`Button` variants: `default` (indigo), `secondary`, `outline`, `ghost`,
`destructive`, `link`. Sizes: `default`, `sm`, `lg`, `icon`.

## Wrapping / setup

- `Tooltip` requires a `TooltipProvider` ancestor. `Toast` requires
  `ToastProvider` + a `ToastViewport`.
- `Dialog`/`Select`/`Tooltip`/`Toast` are Radix-portal-based: their open state
  renders in a portal. No global app-level provider is otherwise required —
  drop components straight into a page.

## Idiomatic snippet

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent,
         CardFooter, Badge, Button } from "window.ERI";

<Card className="w-[360px]">
  <CardHeader>
    <CardTitle>Reinert classification</CardTitle>
    <CardDescription>Cluster text segments into lexical classes.</CardDescription>
  </CardHeader>
  <CardContent className="flex flex-wrap gap-2">
    <Badge variant="secondary">2,357 segments</Badge>
    <Badge variant="success">100% classified</Badge>
  </CardContent>
  <CardFooter className="flex justify-end gap-2">
    <Button variant="ghost">Configure</Button>
    <Button>Run analysis</Button>
  </CardFooter>
</Card>
```
