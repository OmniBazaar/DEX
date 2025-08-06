# Task: Fix All TypeScript Compiler Errors in DEX Module

## Context
You are working on the OmniBazaar DEX module. The codebase has ESLint violations mostly fixed, but there are numerous TypeScript compiler errors preventing the code from building. These are NOT style issues - they are actual compilation errors.

## Your Mission
Fix ALL TypeScript compiler and ESLint errors in the entire `/mnt/c/Users/rickc/OmniBazaar/DEX/src` directory and subdirectories. Work systematically and autonomously without asking for user input. Work alphabetically through the sub-directories and files. Run both TypeScript compiler and ESLint on each file you work on, before continuing to the next file.

## Critical Instructions

1. **Check TypeScript Errors First**

   ```bash
   cd /mnt/c/Users/rickc/OmniBazaar/DEX
   npx tsc --noEmit 2>&1 | grep -E "error TS" | head -50
   ```

2. **Common Error Types to Fix**
   - **TS2308**: Module export ambiguity - Same type exported from multiple modules
   - **TS2305**: Module has no exported member
   - **TS2307**: Cannot find module
   - **TS2339**: Property does not exist on type
   - **TS2345**: Argument type mismatch
   - **TS2322**: Type assignment error
   - **TS7006**: Parameter implicitly has 'any' type

3. **Fix Strategy by Error Type**

   **For TS2308 (Export Ambiguity):**
   - Replace `export *` with specific named exports
   - Use aliases: `export { Type as ModuleType }`
   - Choose one canonical source for each type

   **For TS2305 (Missing Export):**
   - Check if the export name is correct (case-sensitive)
   - Verify the module actually exports that member
   - Add the missing export if needed

   **For TS2307 (Cannot Find Module):**
   - Check import paths are correct
   - Ensure file extensions are not included in imports
   - Verify the module exists

   **For TS2339 (Property Does Not Exist):**
   - Add missing property to interface/type
   - Fix typos in property names
   - Add proper type assertions if needed

4. **Working Order**
   - Fix `src/index.ts` first (main entry point)
   - Then fix in this order: types → utils → database → api → services → engines → avalanche → client
   - Fix index.ts files in each directory before other files

5. **Rules**
   - NEVER use `@ts-ignore` or `@ts-expect-error`
   - NEVER use `any` or `unknown` type to bypass errors. Find the actual type from the context in the file.
   - NEVER stub, mock, or leave code incomplete with a "TODO" message in an implementation file
   - NEVER comment out a function or missing dependency just to get the compiler to compile. Fix the actual issue.
   - NEVER add or remove any files
   - NEVER remove any functionality
   - ALWAYS look for and fix any instances you find of stubs, mocks, or incomplete "TODO" in the code
   - ALWAYS add proper types
   - MAINTAIN existing ESLint compliance
   - ADD imports as needed
   - CREATE missing types if necessary

6. **Validation After Each Major Fix**

   ```bash
   npx tsc --noEmit 2>&1 | grep -c "error TS"
   ```

   The goal is to get this to 0.

7. **When Creating New Types**
   - Put shared types in `src/types/` directory
   - Follow existing naming conventions
   - Add JSDoc documentation
   - Export from appropriate index.ts

8. **For Complex Issues**
   - If a type is used in multiple places, create it in the most logical shared location
   - If fixing one error creates others, fix those too
   - If an import cycle is detected, refactor to break the cycle

9. **Progress Tracking**
   - After fixing each file, run tsc to check remaining errors. Then run ESLint and fix any error or warnings that are reported.
   - Keep track of types you create or move
   - Keep track of your progress internally. Do not stop to report progress to the user until you have fixed all errors and warnings.

10. **Final Validation**
    When you think you're done:

    ```bash
    cd /mnt/c/Users/rickc/OmniBazaar/DEX
    npx tsc --noEmit
    npx eslint src --ext .ts
    ```

    Both commands should complete with no errors.

## Start Now
Begin by checking current TypeScript errors, then systematically fix them starting with src/index.ts. Work autonomously, make decisions based on the patterns you see in the codebase, and don't stop until all TypeScript compiler errors are resolved.

Remember: This is about fixing actual TypeScript compilation errors, not just ESLint style issues. Focus on CODE QUALITY and making the code compile successfully.
