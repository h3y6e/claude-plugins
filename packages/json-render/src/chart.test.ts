import assert from "node:assert/strict";
import { test } from "node:test";

import { drawChart, drawImage } from "./chart.ts";

await test("棒グラフを描くと、alt には題と、最大値を 20 マスとした文字の棒が入る", () => {
  // Arrange
  const chart = {
    type: "bar" as const,
    categories: ["月", "火"],
    series: [{ name: "ms", values: [120, 80] }],
  };

  // Act
  const { alt } = drawChart("週次", chart);

  // Assert
  assert.equal(alt, `週次\n月 ${"█".repeat(20)} 120\n火 ${"█".repeat(13)} 80`);
});

await test("負の値と幅の違う項目名を含む棒グラフは、0 を基準に棒を描き、文字のグラフの棒の位置が揃う", () => {
  // Arrange
  const chart = {
    type: "bar" as const,
    categories: ["月", "Tue"],
    series: [{ name: "差", values: [-10, 20] }],
  };

  // Act
  const { svg, alt } = drawChart(undefined, chart);

  // Assert
  assert.doesNotMatch(svg, /height="-/);
  assert.equal(alt, `月  ${"█".repeat(10)} -10\nTue ${"█".repeat(20)} 20`);
});

await test("外のファイルや URL を参照する SVG の Image は、参照先を示すエラーになる", () => {
  // Arrange
  const src =
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="32"><image href="file:///etc/passwd"/></svg>';

  // Act
  const draw = () => drawImage(src, "図");

  // Assert
  assert.throws(draw, /href="file:\/\/\/etc\/passwd/);
});

await test("base64 の data:image/svg+xml URL の Image は、UTF-8 として復号した SVG になる", () => {
  // Arrange
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="32"><title>四角</title></svg>';
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  // Act
  const picture = drawImage(src, "図");

  // Assert
  assert.deepEqual(picture, { svg, width: 80, height: 32, alt: "図" });
});

await test("外部 DTD、xml-stylesheet、CSS エスケープで外を参照する SVG の Image は、どれもエラーになる", () => {
  // Arrange
  const svgs = [
    '<!DOCTYPE svg SYSTEM "http://example.com/x.dtd"><svg xmlns="http://www.w3.org/2000/svg"/>',
    '<?xml-stylesheet href="http://example.com/x.css"?><svg xmlns="http://www.w3.org/2000/svg"/>',
    '<svg xmlns="http://www.w3.org/2000/svg"><style>rect{fill:u\\72l(http://example.com/x)}</style></svg>',
  ];

  // Act
  const draws = svgs.map((svg) => () => drawImage(svg, "図"));

  // Assert
  for (const draw of draws) assert.throws(draw, /refers to something outside itself/);
});
