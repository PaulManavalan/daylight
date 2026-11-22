import { test } from "node:test";
import assert from "node:assert/strict";
import { askLocalModel } from "../src/lib/local-model";
import { BrowserModel } from "../src/lib/browser-model";
import {
  emptyNotionDay,
  UnapprovedDayActionClaim,
} from "../src/lib/notion-day-model";

const known = emptyNotionDay();
const request = {
  mode: "notion_day" as const,
  persona: { name: "Daylight", tone: "calm" as const },
  messages: [
    { role: "user" as const, content: "What if I finished Review chapter?" },
  ],
  context: JSON.stringify({
    knownDay: known,
    source: { items: [{ key: "a", title: "Review chapter" }] },
  }),
};
for (const provider of ["local", "browser"] as const) {
  for (const repairable of [true, false]) {
    test(`${provider} repairs a false completion claim once, then ${repairable ? "returns conditional discussion" : "fails without a second extraction"}`, async (t) => {
      const calls: { messages: { content: string }[] }[] = [];
      const response = (body: { messages: { content: string }[] }) => {
        calls.push(body);
        return calls.length === 1
          ? {
              dailyContext: known,
              reply: "Preparing a response.",
              homeworkCheckin: null,
            }
          : {
              reply:
                repairable && calls.length === 3
                  ? "If you finished it, you could use that time for another priority."
                  : "Great, you've marked it complete.",
            };
      };
      let ask: () => Promise<unknown>;
      if (provider === "local") {
        const previous = globalThis.fetch;
        globalThis.fetch = async (input, init) =>
          String(input).endsWith("/api/tags")
            ? Response.json({ models: [{ name: "gemma3:latest" }] })
            : Response.json({
                message: {
                  content: JSON.stringify(
                    response(JSON.parse(String(init?.body))),
                  ),
                },
              });
        t.after(() => {
          globalThis.fetch = previous;
        });
        ask = () => askLocalModel(request, new AbortController().signal);
      } else {
        const model = new BrowserModel();
        Object.assign(model, {
          engine: {
            chat: {
              completions: {
                create: async (body: { messages: { content: string }[] }) => ({
                  choices: [
                    {
                      finish_reason: "stop",
                      message: { content: JSON.stringify(response(body)) },
                    },
                  ],
                }),
              },
            },
          },
        });
        ask = () => model.ask(request, new AbortController().signal);
      }
      if (repairable) assert.ok(await ask());
      else await assert.rejects(ask, UnapprovedDayActionClaim);
      assert.equal(calls.length, 3);
      assert.match(
        calls[2].messages.at(-1)!.content,
        /previous reply asserted/,
      );
    });
  }
}
