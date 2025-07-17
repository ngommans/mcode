const {
    defineConfig,
    globalIgnores,
} = require("eslint/config");

const tsParser = require("@typescript-eslint/parser");
const typescriptEslint = require("@typescript-eslint/eslint-plugin");
const reactHooks = require("eslint-plugin-react-hooks");

const {
    fixupPluginRules,
    fixupConfigRules,
} = require("@eslint/compat");

const globals = require("globals");
const js = require("@eslint/js");

const {
    FlatCompat,
} = require("@eslint/eslintrc");

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

module.exports = defineConfig([{
    languageOptions: {
        parser: tsParser,
        ecmaVersion: 2022,
        sourceType: "module",

        parserOptions: {
            project: "./tsconfig.eslint.json",
            tsconfigRootDir: __dirname,
        },

        globals: {
            ...globals.node,
            ...globals.browser,
        },
    },

    plugins: {
        "@typescript-eslint": typescriptEslint,
        "react-hooks": fixupPluginRules(reactHooks),
    },

    extends: compat.extends(
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:@typescript-eslint/recommended-requiring-type-checking",
        "plugin:@typescript-eslint/strict",
        "prettier",
    ),

    rules: {
        "@typescript-eslint/no-explicit-any": "error",

        "@typescript-eslint/no-unused-vars": ["error", {
            "argsIgnorePattern": "^_",
            "varsIgnorePattern": "^_",
        }],

        "@typescript-eslint/no-unsafe-assignment": "error",
        "@typescript-eslint/no-unsafe-member-access": "error",
        "@typescript-eslint/no-unsafe-argument": "error",
        "@typescript-eslint/no-unsafe-call": "error",
        "@typescript-eslint/no-unsafe-return": "error",
        "@typescript-eslint/no-unused-expressions": "error",
        "@typescript-eslint/prefer-as-const": "error",
        "@typescript-eslint/no-inferrable-types": "error",
        "@typescript-eslint/no-unnecessary-type-assertion": "error",
        "prefer-const": "error",
        "no-var": "error",
        "no-case-declarations": "error",

        "no-console": ["error", {
            "allow": ["warn", "error"],
        }],

        "no-duplicate-imports": "error",
        "eqeqeq": ["error", "always"],
        "no-eval": "error",
        "no-implied-eval": "error",
        "no-unused-expressions": "error",
        "no-unreachable": "error",
        "no-shadow": "error",
        "no-undef": "error",
        "no-redeclare": "error",
    },
}, globalIgnores(["**/dist/", "**/node_modules/", "**/*.d.ts", "**/vite.config.ts"]), {
    files: ["**/*.test.ts", "**/*.spec.ts", "**/test/**/*.ts", "**/__tests__/**/*.ts"],

    rules: {
        "no-console": "off",
        "@typescript-eslint/no-explicit-any": "warn",
        "@typescript-eslint/no-unsafe-assignment": "warn",
        "@typescript-eslint/no-unsafe-member-access": "warn",
        "@typescript-eslint/no-unsafe-argument": "warn",
    },
}, {
    files: ["apps/web-client/**/*.tsx", "apps/web-client/**/*.ts"],
    extends: fixupConfigRules(compat.extends("plugin:react-hooks/recommended")),

    rules: {
        "react-hooks/exhaustive-deps": "error",
        "react-hooks/rules-of-hooks": "error",

        "no-console": ["warn", {
            "allow": ["warn", "error", "log"],
        }],
    },

    languageOptions: {
        globals: {
            ...globals.browser,
        },
    },
}, {
    files: [
        "**/utils/typeSafe*.ts",
        "**/utils/typeSafeData.ts",
        "**/utils/typeSafeGitHub.ts",
        "**/utils/typeSafeTunnel.ts",
    ],

    rules: {
        "@typescript-eslint/no-unsafe-assignment": "warn",
        "@typescript-eslint/no-unsafe-member-access": "warn",
        "@typescript-eslint/no-unsafe-argument": "warn",
        "@typescript-eslint/no-unsafe-call": "warn",
        "@typescript-eslint/no-unsafe-return": "warn",
        "no-console": "off",
    },
}, {
    files: ['packages/standalone/src/server.ts'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
    },
}]);