import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { App } from "./app";

test("renders the app heading", () => {
	const html = renderToStaticMarkup(<App />);

	expect(html).toContain("Hello, world!");
});
