# Source provenance

Imported data is from the supplied workspace and the unchanged boundary-lab-v2 package. All source values remain source-derived; compiler rules and rendering scaffolding are new project code.

| Copied source | SHA-256 |
|---|---|
| `boundary-core.md` | `eb83ed3b505982b18d8ce5030537f3f2b12d5e24c3696d1fb9ceb18a1151b4fa` |
| `compact-original.json` | `9bf6c83f1a904169516d3cde36f06685d0434bdc51fd4400c4abadf21bfb3253` |
| `extension-fixtures.json` | `09fbd1d5d1f630ffc009f9e60530cd3d567bf51d87356ef53267abe773c2d03a` |
| `few-shot-contrasts.json` | `b7f60ff899b7ad579db0e4fbb39a224a2a7e66f1e210f27ce3664f73c9d490ab` |
| `historical-token-anchors.json` | `01846442fca50fe4a4bce0abba824bb82c42b31c4df6a41d2bf3b6d46ca7adab` |
| `project-bindings.json` | `12fc50565c73a52937c6f282d27f5852a28db0bb511db1437b39f05937c7b2b5` |
| `restore-section-3.md` | `5e91b7ec6e38bd91a23fac8e404b6b68847e077f3955104c786ccc6e99e9051b` |
| `restore-section-5.md` | `0584831024995681c412ae1ef423cadc42efddfd220ec0d9994f38435a963745` |
| `restore-section-6.md` | `9f6967e80ca03aaa9619a6eb8fc73a6c749ef1e1574903e4773da6508a64f9b5` |
| `revised-demonstrations.json` | `e7b749dccc330782b46ed8a64287326163bff4bee76ee3cfc5654d8905952410` |
| `rich-control.md` | `56b77c5efa6b4df0da9a240284a532da5b9d21e35e2450976da98a27718de3f0` |

The minimal original project module dependency closure is hash-checked before import. Only case-builder/padding code is loaded; no provider, credential or ledger module is imported.

Native v2 request construction and case construction are retained under `adapters/frozen-v2/`; all their generated values are imported explicitly. The IR never receives the outer case expected-label/rationale object.

Raw test reports were not used as model input or training examples. These compiled artifacts contain synthetic project fixtures and application-authored demonstrations, not API credentials.
