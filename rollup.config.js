import typescript from "rollup-plugin-typescript2"

export default {
  input: "./src/host/bookmarklet.ts",

  plugins: [
    typescript({
      check: false,
      tsconfig: "tsconfig.json"
    })
  ]
}
