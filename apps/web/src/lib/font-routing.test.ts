import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, proxy } from "../proxy";

test("self-hosted fonts bypass the login proxy while CRM pages retain authentication routing", () => {
  for (const path of ["/fonts/22a5144ee8d83bca-s.p.woff2", "/fonts/b261c59b2d76913d-s.p.woff2", "/fonts/geist-OFL.txt"]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, url: "http://localhost:3000" + path }), false);
  }
  for (const path of ["/companies", "/pricing", "/pricing/estimates", "/imports", "/admin/users", "/demos", "/fontshop/private"]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, url: "http://localhost:3000" + path }), true);
    const response = proxy(new NextRequest("http://localhost:3000" + path));
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get("location")!).pathname, "/login");
  }
  assert.equal(proxy(new NextRequest("http://localhost:3000/login")).status, 200);
});
