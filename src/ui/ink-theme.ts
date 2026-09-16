import { defaultTheme as inkDefaultTheme, extendTheme } from "@inkjs/ui";

import { theme } from "./theme";

/**
 * @inkjs/ui 的默认前景色继承终端主题，会落在白底上看不清。
 * 这里把需要控色的组件统一收口到我们自己的 token。
 */
export const inkTheme = extendTheme(inkDefaultTheme, {
  components: {
    Spinner: {
      styles: {
        frame: () => ({ color: theme.accent }),
      },
    },
    TextInput: {
      styles: {
        value: () => ({ color: theme.text }),
      },
    },
  },
});
