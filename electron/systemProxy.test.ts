import { describe, expect, it } from "vitest";
import type { Dispatcher } from "undici";
// 从纯模块导入，避免触发 electron 运行时（CI 纯 Node 会失败）。Session 仅类型引用，已被擦除。
import {
  describeNetworkError,
  parseEnvProxy,
  parseResolveProxyString,
  SelectiveProxyDispatcher,
} from "./systemProxy";

describe("parseEnvProxy", () => {
  it("HTTPS_PROXY 优先于 HTTP_PROXY", () => {
    const r = parseEnvProxy({ HTTPS_PROXY: "http://127.0.0.1:7897", HTTP_PROXY: "http://127.0.0.1:1111" });
    expect(r).toEqual({ kind: "http", url: "http://127.0.0.1:7897", source: "env" });
  });

  it("裸 host:port 自动补 http://", () => {
    expect(parseEnvProxy({ HTTP_PROXY: "127.0.0.1:7897" })).toEqual({
      kind: "http",
      url: "http://127.0.0.1:7897",
      source: "env",
    });
  });

  it("小写 https_proxy 也认", () => {
    expect(parseEnvProxy({ https_proxy: "http://10.0.0.1:8080" })).toMatchObject({ kind: "http" });
  });

  it("SOCKS 代理 → unsupported（Phase 1 不支持）", () => {
    expect(parseEnvProxy({ ALL_PROXY: "socks5://127.0.0.1:7891" }).kind).toBe("unsupported");
  });

  it("无任何代理环境变量 → none", () => {
    expect(parseEnvProxy({})).toEqual({ kind: "none" });
  });
});

describe("parseResolveProxyString（Electron session.resolveProxy 返回串）", () => {
  it("DIRECT → none", () => {
    expect(parseResolveProxyString("DIRECT")).toEqual({ kind: "none" });
  });

  it("PROXY host:port → http 代理", () => {
    expect(parseResolveProxyString("PROXY 127.0.0.1:7897")).toEqual({
      kind: "http",
      url: "http://127.0.0.1:7897",
      source: "system",
    });
  });

  it("取第一条非 DIRECT 项（PROXY h:p;DIRECT）", () => {
    expect(parseResolveProxyString("PROXY 192.168.1.2:8888;DIRECT")).toMatchObject({
      kind: "http",
      url: "http://192.168.1.2:8888",
    });
  });

  it("HTTPS 类型 → https 代理（非默认端口保留）", () => {
    expect(parseResolveProxyString("HTTPS proxy.corp:8443")).toMatchObject({
      kind: "http",
      url: "https://proxy.corp:8443",
    });
  });

  it("SOCKS5 → unsupported", () => {
    expect(parseResolveProxyString("SOCKS5 127.0.0.1:7891").kind).toBe("unsupported");
  });
});

describe("SelectiveProxyDispatcher（私网走直连，其余走代理）", () => {
  function makeFakeDispatcher(tag: string, sink: string[]): Dispatcher {
    return {
      dispatch(opts: Dispatcher.DispatchOptions) {
        sink.push(`${tag}:${String(opts.origin)}`);
        return true;
      },
      close: async () => {},
      destroy: async () => {},
    } as unknown as Dispatcher;
  }

  it("公网 origin → 走代理", () => {
    const calls: string[] = [];
    const d = new SelectiveProxyDispatcher(
      makeFakeDispatcher("proxy", calls),
      makeFakeDispatcher("direct", calls),
    );
    d.dispatch({ origin: "https://api.apimart.ai", path: "/", method: "GET" }, {} as never);
    expect(calls).toEqual(["proxy:https://api.apimart.ai"]);
  });

  it("localhost / 127.0.0.1 / 私网 → 走直连（不代理本地模型服务器）", () => {
    const calls: string[] = [];
    const d = new SelectiveProxyDispatcher(
      makeFakeDispatcher("proxy", calls),
      makeFakeDispatcher("direct", calls),
    );
    d.dispatch({ origin: "http://127.0.0.1:11434", path: "/", method: "GET" }, {} as never);
    d.dispatch({ origin: "http://localhost:1234", path: "/", method: "GET" }, {} as never);
    d.dispatch({ origin: "http://192.168.1.50:8080", path: "/", method: "GET" }, {} as never);
    expect(calls).toEqual([
      "direct:http://127.0.0.1:11434",
      "direct:http://localhost:1234",
      "direct:http://192.168.1.50:8080",
    ]);
  });
});

describe("describeNetworkError（把 fetch failed 翻成人话）", () => {
  function withCause(code: string): Error {
    const e = new TypeError("fetch failed");
    (e as Error & { cause?: unknown }).cause = { code };
    return e;
  }

  it("ETIMEDOUT → 连接超时 + 代理提示", () => {
    expect(describeNetworkError(withCause("ETIMEDOUT"))).toMatch(/连接超时/);
  });

  it("ENOTFOUND → DNS 解析失败", () => {
    expect(describeNetworkError(withCause("ENOTFOUND"))).toMatch(/DNS 解析失败/);
  });

  it("ECONNREFUSED → 连接被拒绝", () => {
    expect(describeNetworkError(withCause("ECONNREFUSED"))).toMatch(/连接被拒绝/);
  });

  it("AbortError → 请求超时", () => {
    const e = new Error("aborted");
    e.name = "AbortError";
    expect(describeNetworkError(e)).toMatch(/请求超时/);
  });

  it("裸 fetch failed（无 code）→ 兜底人话，不再露出 'fetch failed'", () => {
    const out = describeNetworkError(new TypeError("fetch failed"));
    expect(out).toMatch(/网络请求失败/);
    expect(out).not.toBe("fetch failed");
  });
});
