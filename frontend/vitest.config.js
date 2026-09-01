import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    test: {
        environment: "jsdom",
        include: ["src/**/*.runtime.test.{js,jsx}"],
        setupFiles: ["./src/test/setup.js"],
        clearMocks: true,
        restoreMocks: true,
    },
});
