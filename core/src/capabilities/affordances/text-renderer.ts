import type { HateoasResponse } from "./parser.js";

export interface ResponseRenderer {
  render(response: HateoasResponse): string;
}

/** Renders HATEOAS responses as plain text for messaging channels. */
export class TextRenderer implements ResponseRenderer {
  render(response: HateoasResponse): string {
    if (response.links.length === 0) return response.text;
    const list = response.links
      .map((l, i) => `${i + 1}. ${l.label}`)
      .join("\n");
    return `${response.text}\n\n${list}`;
  }
}
