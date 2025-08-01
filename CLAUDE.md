# General Rules

IMPORTANT: Follow all project coding standards found here: C:\Users\rickc\OmniBazaar\CLAUDE.md

- Don't "reinvent the wheel". USE the WORKING tools, code, templates, references, and examples provided in C:\Users\rickc\OmniBazaar\DEX\dydx-reference. DO NOT write your own new code if you can refactor, modify, or translate some existing code. Integrate DXDY's funtionalities into our application. Reference the working designs and code. That's what it is there for.

- Create tests that actually test the functionality and interoperability of the contracts. If testing shows issues in the code, fix the code. Don't modify the tests for the sake of getting the code to pass the tests. Instead modify the code to pass the tests.

- DO NOT USE STUB OR MOCKS. Do actual integration of components and modules. Tight integration is critical in OmniBazaar/OmniCoin/OmniWallet/CryptoBazaar. Do the work NOW to create the actual account, service, component or function you need. Mocks and stubs are LAZY programming. DO THE WORK. DON'T PUT IT OFF. If you must use mocks or stubs in a TEST, mark it clearly.

- If you find any instances in the code where mocks, stubs, or "todos" exist, replace those with the code required to make the function or feature actually work.

- ALWAYS NatSpec comment your code when you write it. DON'T put it off.

- PERSEVERE. STAY ON TASK. CONFRONT DIFFICULT TASKS. Don't look for shortcuts. Find the problem and fix it.

- Fix all warnings in addition to fixing the errors. Add NatSpec documentation, fix sequencing issues, complexity, line length, and shadow declarations. Check all "not-rely-on-time" instances to be sure the business case really needs them. If so, you may disable the warning with solhint-disable-line comments. Fix every warning you can. Don't put it off for "later".

- For off-chain data, consider the greater efficiency of achieving consensus by database synchronization rather than each node recomputing the database state from the stream of events.

CRITICAL: Tokenomics, fees, and reputation instructions are here: OmniBazaar Design Checkpoint.txt