import { defaultTheme as inkDefaultTheme, extendTheme } from "@inkjs/ui";

import { theme } from "./theme";

/**
 * 全界面不铺底色、跟随终端原生背景，这里只收口需要控色的组件
 * 到我们自己的 token：Spinner 用强调色，输入值用终端默认前景。
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
