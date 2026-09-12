import React from "react";
import { render } from "ink-testing-library";
import { Box, Text } from "ink";
import { TextInput, Spinner } from "@inkjs/ui";

const { lastFrame } = render(
  <Box borderStyle="round" paddingX={1}>
    <Text color="#F5F5F7">coderelay</Text>
    <TextInput placeholder="输入 prompt" />
  </Box>,
);
console.log(JSON.stringify(lastFrame()));
console.log(typeof Spinner);
