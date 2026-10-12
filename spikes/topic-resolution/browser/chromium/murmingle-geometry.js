// Approved Shared space mark: opposing speech shapes with a transparent lens.
// One geometry serves the panel SVG, toolbar Canvas and packaged PNGs.
const BUBBLE = Object.freeze([
  ["M", 11.2, 3.7], ["Q", 12, 3.1, 12, 4.1], ["L", 12, 7.6],
  ["Q", 16.2, 8.1, 18.5, 11], ["Q", 20.2, 13.1, 20.2, 15.5],
  ["Q", 20.2, 19.1, 16.5, 21.1], ["Q", 13.9, 22.4, 10, 22.4],
  ["Q", 6.3, 22.4, 4.1, 20.2], ["Q", 2, 18.2, 2, 14.6],
  ["Q", 2, 10.7, 5.6, 7.9], ["L", 11.2, 3.7], ["Z"],
].map(Object.freeze));
export const MURMINGLE_COMMANDS = Object.freeze([
  ...BUBBLE,
  ...BUBBLE.map(([command, ...coordinates]) => Object.freeze([
    command, ...coordinates.map(value => Number((32 - value).toFixed(1))),
  ])),
]);
export const MURMINGLE_PATH = MURMINGLE_COMMANDS.map(([command, ...coordinates]) =>
  `${command}${coordinates.join(" ")}`).join(" ");

export function traceMurmingle(context) {
  context.beginPath();
  for (const [command, ...coordinates] of MURMINGLE_COMMANDS) {
    if (command === "M") context.moveTo(...coordinates);
    else if (command === "L") context.lineTo(...coordinates);
    else if (command === "Q") context.quadraticCurveTo(...coordinates);
    else context.closePath();
  }
}
