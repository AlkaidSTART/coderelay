# 禁止写any类型

# 应该按照最小改动原则开发

# 有觉得好的功能应该先和用户讨论再实现

# 保持单一数据源（SSOT）
- 枚举、字面量联合、合法取值集合必须从核心定义模块导入已有常量（如 `MODEL_STRENGTHS`），严禁在业务逻辑中私自重复维护硬编码列表。

# 禁止手写弱校验类型谓词
- 自定义 Type Guard（`val is Type`）必须基于已有常量集合（如 `(CONST_ARRAY as readonly unknown[]).includes(val)`）或 Zod Schema 推导，杜绝手动 `===` 罗列字符串。

# 测试数据禁止仅用全空桩数据
- 涉及字段映射、元数据透传（如 `strengths`、`cost`、`metadata`）的逻辑，单元测试必须包含非空有效值及边界值断言，禁止全用空数组 `[]` 或默认值敷衍。