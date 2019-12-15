# travis-ci
Shared travis-ci configs.

Some examples of this shared config in use:
 - https://github.com/ljharb/qs/commit/6151be3bc24d61d63500d904d5e3484524400d88
 - https://github.com/ljharb/object.assign/commit/0d4f5ed0e0c8e1049c33a2e2a728be52d67c5d25
 - https://github.com/ljharb/es-abstract/commit/17fb792b654a4fc866f9a59379f5b621462159e9

When a new version of node comes out, instead of potentially having to update hundreds of repos, I’ll update just this one - and all consumers will get it for free on their next CI run.

At the moment this contains these preset dirs for node:
 - `minors`: every minor version of node. The latest minor in a given major is required to pass, every other minor in that major is an allowed failure.
    - `all`: everything ever released
    - `LTS`: the `LTS-active` and `LTS-EOL` configs.
    - `LTS-active`: every LTS version of node whose support status is in "active maintenance"
    - `LTS-EOL`: every LTS version of node whose support status is End of Life
    - `gte_12`: v12 - v13
    - `gte_10`: v10 - v13
    - `gte_8`: v8 - v13
    - `gte_6`: v6 - v13
    - `gte_4`: v4 - v13
    - `iojs`: io.js, v1 - v3
    - `13`: v13
    - `12`: v12
    - `11`: v11
    - `10`: v10
    - `9`: v9
    - `8`: v8
    - `7`: v7
    - `6`: v6
    - `5`: v5
    - `4`: v4
 - `majors`: every major version of node.
    - `all`: everything ever released
    - `LTS`: the `LTS-active` and `LTS-EOL` configs.
    - `LTS-active`: every LTS version of node whose support status is in "active maintenance"
    - `LTS-EOL`: every LTS version of node whose support status is End of Life
    - `gte_12`: v12 - v13
    - `gte_10`: v10 - v13
    - `gte_8`: v8 - v13
    - `gte_6`: v6 - v13
    - `gte_4`: v4 - v13
    - `iojs`: io.js, v1 - v3
 - `0.x`
    - `all`: v0.12, v0.10, v0.8 are required to pass; v0.11, v0.9, v0.6, and v0.4 are allowed to fail.
    - `12`: node v0.12
    - `10`: node v0.10
    - `8`: node v0.8

I’m happy to add more variants as people need them.
