import { describe, expect, it } from "vitest";
import {
  maskUserNameForLogs,
  redactLogValue,
  redactCurrentUserText,
  redactCurrentUserValue,
  redactSensitiveLogText,
} from "../log-redaction.js";
import { REDACTED_EVENT_VALUE } from "../redaction.js";

describe("log redaction", () => {
  it("redacts the active username inside home-directory paths", () => {
    const userName = "paperclipuser";
    const maskedUserName = maskUserNameForLogs(userName);
    const input = [
      `cwd=/Users/${userName}/paperclip`,
      `home=/home/${userName}/workspace`,
      `win=C:\\Users\\${userName}\\paperclip`,
    ].join("\n");

    const result = redactCurrentUserText(input, {
      userNames: [userName],
      homeDirs: [`/Users/${userName}`, `/home/${userName}`, `C:\\Users\\${userName}`],
    });

    expect(result).toContain(`cwd=/Users/${maskedUserName}/paperclip`);
    expect(result).toContain(`home=/home/${maskedUserName}/workspace`);
    expect(result).toContain(`win=C:\\Users\\${maskedUserName}\\paperclip`);
    expect(result).not.toContain(userName);
  });

  it("redacts standalone username mentions without mangling larger tokens", () => {
    const userName = "paperclipuser";
    const maskedUserName = maskUserNameForLogs(userName);
    const result = redactCurrentUserText(
      `user ${userName} said ${userName}/project should stay but apaperclipuserz should not change`,
      {
        userNames: [userName],
        homeDirs: [],
      },
    );

    expect(result).toBe(
      `user ${maskedUserName} said ${maskedUserName}/project should stay but apaperclipuserz should not change`,
    );
  });

  it("recursively redacts nested event payloads", () => {
    const userName = "paperclipuser";
    const maskedUserName = maskUserNameForLogs(userName);
    const result = redactCurrentUserValue({
      cwd: `/Users/${userName}/paperclip`,
      prompt: `open /Users/${userName}/paperclip/ui`,
      nested: {
        author: userName,
      },
      values: [userName, `/home/${userName}/project`],
    }, {
      userNames: [userName],
      homeDirs: [`/Users/${userName}`, `/home/${userName}`],
    });

    expect(result).toEqual({
      cwd: `/Users/${maskedUserName}/paperclip`,
      prompt: `open /Users/${maskedUserName}/paperclip/ui`,
      nested: {
        author: maskedUserName,
      },
      values: [maskedUserName, `/home/${maskedUserName}/project`],
    });
  });

  it("skips redaction when disabled", () => {
    const input = "cwd=/Users/paperclipuser/paperclip";
    expect(redactCurrentUserText(input, { enabled: false })).toBe(input);
  });

  it("redacts sensitive log object fields before they reach HTTP error logs", () => {
    const result = redactLogValue({
      message: "bad request",
      details: {
        password: "hunter2",
        nested: {
          apiKey: "sk-project-secret-value",
          safe: "visible",
        },
        env: {
          DATABASE_URL: "postgres://user:pass@localhost:5432/app",
        },
      },
    });

    expect(result).toEqual({
      message: "bad request",
      details: {
        password: REDACTED_EVENT_VALUE,
        nested: {
          apiKey: REDACTED_EVENT_VALUE,
          safe: "visible",
        },
        env: {
          DATABASE_URL: REDACTED_EVENT_VALUE,
        },
      },
    });
  });

  it("redacts free-text secrets and bearer tokens in log strings", () => {
    const result = redactSensitiveLogText(
      "authorization: Bearer abc.def.ghi api_key=sk-test-secretvalue123 password=hunter2",
    );

    expect(result).not.toContain("abc.def.ghi");
    expect(result).not.toContain("sk-test-secretvalue123");
    expect(result).not.toContain("hunter2");
    expect(result).toContain(REDACTED_EVENT_VALUE);
  });
});
