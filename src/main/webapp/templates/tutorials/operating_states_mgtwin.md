# Operating states, Check Design and the validity label (mgtwin Site)

This tutorial walks through **Simulate → Operating State...**, **Simulate → Check Design...** and
**Simulate → Export as mgtwin Site...**: running any study in one of a network's operating states, screening the
drawn network with the twin's gates, and reading the label a study comes back with.

## What a Site is

A drawing shows a network one way: its **normal** state. A real network has others - a board lost, a feeder
transferred, each step of a black start - and a study that matters is often run in one of those.

An **mgtwin Site** is a JSON record of the network that declares them. Alongside the buses, transformers, switches,
sources and loads it holds the **operating states** (`islands`), each one:

- which sources run (`energized_source_ids`);
- which switches it opens (`open_switches`) and which normally open ones it closes (`closed_switches` - a tie, the
  second leg of a transfer);
- which loads move (`load_factors` - `{"IT_cordB": 2.0}` when the dual-corded halls move to cord B because board A
  is lost);
- which protection settings group the relays run (`settings_group`).

The Site's names must be the drawing's: a switch called `CB_TIE` in the Site is the switch named `CB_TIE` on the
diagram, a load `IT_cordB` the load whose name starts with `IT_cordB`. **Export as mgtwin Site...** writes a Site
from the drawing, so the names match from the start.

## Steps

1. Open the network's diagram.
2. **Simulate → Operating State...** → **Load Site...** and choose the Site's `.json`.
3. Pick a state - or **Normal (as drawn)** - and **Apply**. Each state's line shows its sources, the switches it opens
   and closes, its load transfers and its settings group.
4. A banner at the foot of the drawing names the state. Run any study from the **Simulate** menu: it runs in that
   state. The drawing itself is not changed.
5. After a study the banner adds the **last result** label (below). Hover over it for the reasons.
6. Click the banner to choose another state; **×** goes back to the drawn state. The choice is kept in this browser.

### Check Design

**Simulate → Check Design...** sends the drawn network - with the loaded Site's states and relays - through mgtwin's
seven gates and lists what they find, gate by gate:

| Gate | Asks |
|---|---|
| units | are the values plausible, and on the right base (a transformer's reactance on its own rating)? |
| grounding | does every islanded zone keep a path to earth? |
| protection | will each relay see the fault in each state's settings group; does protection rest on fault-current magnitude where converters limit it; does a breaker fed from both sides need direction? |
| honesty | which converter behaviours are assumed rather than identified? |
| forming | does every energised section have a grid-forming source? |
| energisation | can the forming sources carry the inrush of the transformers a state switches in? |
| loading | can the sources a state energises carry the load it leaves connected? |

A **FAIL** comes with its remedy. The gates screen from **ratings**: a PASS is necessary, not sufficient - a study
decides. Without a Site loaded the check sees the drawn state only.

## The last-result label

A study run in a state comes back labelled with the twin's verdict on it:

- **INSIDE** - nothing in the Site qualifies the result.
- **PROVISIONAL** - the result rests on something assumed: converter dynamics, current limits or ride-through not
  identified from measured response, load above the state's sustained sources (valid while the storage lasts), or a
  protection study that covered part of the state.
- **OUTSIDE** - the Site says the result does not hold: the gates fail this state for what the study looks at (a
  transformer feeding more than its rating, a section with no grid-forming source), a site-wide data error, load
  beyond every source of the state.

The label is about the Site's data and the state, not about the study's method: Electrisim is the solver, so an
EMT or load-flow result is not marked down for being EMT or a load flow. Which study reads which question:

| Study | Label from |
|---|---|
| Load Flow (pandapower or OpenDSS), OPF, AC/DC OPF, State Estimation, Contingency | loading |
| Short Circuit (IEC, ANSI or OpenDSS), Protection Coordination, Arc Flash, POI fault, DC fault, EMT | protection |
| Transient Stability, Eigenvalue (ANDES), Motor Starting | frequency |

Other studies run in the state but carry no label.

## Notes

- **Export as mgtwin Site...** writes the drawing as a Site (`<site>.mgtwin.json`). With a Site loaded, the loaded
  Site lends what a drawing cannot hold: its states, its relays, its converters' control class (droop or VSM) and
  parameters, earthing the drawing does not show (a declared ungrounded pocket).
- Transformer impedances in a Site are on the **transformer's own rating** (6 % on 3 MVA is `x_pu` 0.06), not on the
  site base.
- The server needs mgtwin installed (`backend/requirements-mgtwin.txt`) for **Check Design** and the label; without
  it, states still work and Check Design says mgtwin is not installed.
- A worked case: the C003 off-grid microgrid (`specs/c003_revC2_site_corrected.json` with its diagram) - in
  `MVA_BUS_FAULT` a load flow carries cord B at 25 MW, labelled INSIDE; a short circuit is PROVISIONAL on the PCS'
  and SOFC inverters' assumed current limits; Check Design finds 3 FAIL, all energisation sequence rules.
