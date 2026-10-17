# Interface examples

Small app screens drawn in SFL, to open with the preview. Open a file and run
**SFL: Open Preview to the Side** from the command palette.

| File | Look | What it shows |
| --- | --- | --- |
| `spirit-level.sfl` | light | Two `ruler` vials whose bubbles mark the tilt on each axis. |
| `altimeter.sfl` | dark | A `ruler` as a height scale with labels, its knob on the target summit, and what the climb takes. |
| `thermostat.sfl` | light | A `tickScale` arc, a `rollingNumber` and mode chips. |
| `halo-speedometer.sfl` | dark | The `halo` shader as a speed arc inside a `tickScale` ring. |

## Static on purpose

The preview draws a diagram; it does not run the binding runtime. So every
value in these files is written out (`value: 1.8`, `progress: 0.62`) instead of
bound to a `DataSource` with `<-`. A bound value would render empty here.

In an app the same file comes alive by adding a `DataSource` and binding the
values to it, then mounting it with `createBindingRuntime()` from stickyflow.js.
Change a fixed value here and save to see the widget follow.

A few things the widgets do for you:

- A `ruler` places its `knob` shape on the value itself, so the knob's own
  `layout.position` is only a starting point. `gap: 0` puts it on the line.
- `tickScale` angles start at the top and run counterclockwise: `start: 225`
  with `sweep: 270` leaves the gap at the bottom.
- Shaders (`halo`) and `ruler` draw with WebGL and animate in the preview.
