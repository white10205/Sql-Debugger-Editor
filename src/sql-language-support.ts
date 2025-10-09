import * as monaco from 'monaco-editor';

// 注册SQL语言支持
export function setupSQLLanguageSupport() {
  // 注册SQL语言
  monaco.languages.register({ id: 'sql' });

  // 定义SQL语言配置
  monaco.languages.setLanguageConfiguration('sql', {
    comments: {
      lineComment: '--',
      blockComment: ['/*', '*/']
    },
    brackets: [
      ['(', ')'],
      ['[', ']'],
      ['{', '}']
    ],
    autoClosingPairs: [
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: '{', close: '}' },
      { open: '\'', close: '\'', notIn: ['string', 'comment'] },
      { open: '"', close: '"', notIn: ['string', 'comment'] }
    ],
    surroundingPairs: [
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: '{', close: '}' },
      { open: '\'', close: '\'' },
      { open: '"', close: '"' }
    ]
  });

  
  // 设置SQL语法定义
  monaco.languages.setMonarchTokensProvider('sql', {
    tokenizer: {
      root: [
        // 关键字
        [/\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TABLE|INDEX|DATABASE|SCHEMA|PRIMARY|KEY|FOREIGN|REFERENCES|NOT|NULL|UNIQUE|DEFAULT|AUTO_INCREMENT|INT|INTEGER|VARCHAR|CHAR|TEXT|BLOB|BOOLEAN|DATE|TIME|DATETIME|TIMESTAMP|DECIMAL|FLOAT|DOUBLE|JOIN|INNER|LEFT|RIGHT|FULL|OUTER|ON|AS|AND|OR|XOR|IN|EXISTS|BETWEEN|LIKE|ILIKE|IS|ANY|ALL|SOME|UNION|INTERSECT|EXCEPT|GROUP|BY|HAVING|ORDER|ASC|DESC|LIMIT|OFFSET|DISTINCT|COUNT|SUM|AVG|MIN|MAX|CASE|WHEN|THEN|ELSE|END|IF|COALESCE|NULLIF|CAST|CONVERT|BEGIN|TRANSACTION|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|LOCK|UNLOCK|TRUNCATE|MERGE|UPSERT|REPLACE|VALUES|SET|WITH|RECURSIVE|CTE|OVER|PARTITION)\b/i, 'keyword'],

        // 内置函数
        [/\b(CONCAT|SUBSTRING|LENGTH|UPPER|LOWER|TRIM|LTRIM|RTRIM|REPLACE|REVERSE|REPEAT|SPACE|CHAR_LENGTH|CHARACTER_LENGTH|OCTET_LENGTH|BIT_LENGTH|POSITION|LOCATE|INSTR|LPAD|RPAD|LEFT|RIGHT|MID|SUBSTR|SUBSTRING_INDEX|STRCMP|REGEXP|RLIKE|REGEXP_LIKE|REGEXP_REPLACE|REGEXP_SUBSTR|ABS|SIGN|MOD|FLOOR|CEILING|CEIL|ROUND|SQRT|POW|POWER|EXP|LOG|LOG2|LOG10|LN|SIN|COS|TAN|ASIN|ACOS|ATAN|ATAN2|COT|RADIANS|DEGREES|PI|RAND|UUID|UUID_SHORT|NOW|CURRENT_TIMESTAMP|CURRENT_TIME|CURRENT_DATE|CURDATE|CURTIME|DATE|TIME|YEAR|MONTH|DAY|HOUR|MINUTE|SECOND|DATE_FORMAT|STR_TO_DATE|FROM_DAYS|TO_DAYS|DAYOFWEEK|WEEKDAY|DAYOFMONTH|DAYOFYEAR|MONTHNAME|DAYNAME|QUARTER|WEEK|YEARWEEK|EXTRACT|DATE_ADD|DATE_SUB|ADDDATE|SUBDATE|PERIOD_ADD|PERIOD_DIFF|TIMESTAMPDIFF|TIMESTAMPADD)\b/i, 'predefined.sql'],

        // 标识符
        [/[a-zA-Z_][a-zA-Z0-9_]*/, 'identifier'],

        // 数字
        [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
        [/\d+/, 'number'],

        // 字符串
        [/'[^']*'/, 'string'],
        [/"/, 'string', '@string."'],
        [/'/, 'string', '@string.\''],

        // 注释
        [/--.*/, 'comment'],
        [/\/\*/, 'comment', '@comment'],

        // 操作符
        [/[+\-*\/=<>!]/, 'operators'],
        [/[(),;]/, 'delimiter']
      ],

      string: [
        [/[^\\']+/, 'string'],
        [/\\./, 'string.escape'],
        [/[\'"]/, { cases: { '$#==$S2': { token: 'string', next: '@pop' }, '@default': 'string' } }]
      ],

      comment: [
        [/[^\/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[\/*]/, 'comment']
      ]
    }
  });

  // 设置SQL自动完成
  monaco.languages.registerCompletionItemProvider('sql', {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };

      const suggestions = [
        // SQL关键字
        ...['SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TABLE', 'INDEX'].map(keyword => ({
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: keyword,
          range: range
        })),

        // 函数
        ...['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'CONCAT', 'SUBSTRING', 'UPPER', 'LOWER', 'TRIM'].map(func => ({
          label: func,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: func + '()',
          range: range
        })),

        // 表名 (模拟)
        ...['users', 'orders', 'products', 'categories'].map(table => ({
          label: table,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: table,
          range: range
        })),

        // 列名 (模拟)
        ...['id', 'name', 'email', 'created_at', 'updated_at', 'status', 'price', 'quantity'].map(column => ({
          label: column,
          kind: monaco.languages.CompletionItemKind.Field,
          insertText: column,
          range: range
        }))
      ];

      return { suggestions };
    }
  });

  // 设置SQL悬停提示
  monaco.languages.registerHoverProvider('sql', {
    provideHover: (model, position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return;

      const keyword = word.word.toUpperCase();
      const descriptions: { [key: string]: string } = {
        'SELECT': '用于从数据库表中检索数据的SQL语句',
        'FROM': '指定查询的数据来源表',
        'WHERE': '用于过滤记录的条件子句',
        'INSERT': '用于向表中插入新记录的SQL语句',
        'UPDATE': '用于更新表中现有记录的SQL语句',
        'DELETE': '用于删除表中记录的SQL语句',
        'JOIN': '用于合并多个表的记录',
        'COUNT': '聚合函数，返回行数',
        'SUM': '聚合函数，返回数值列的总和',
        'AVG': '聚合函数，返回数值列的平均值',
        'MIN': '聚合函数，返回最小值',
        'MAX': '聚合函数，返回最大值'
      };

      const description = descriptions[keyword];
      if (description) {
        return {
          range: new monaco.Range(
            position.lineNumber,
            word.startColumn,
            position.lineNumber,
            word.endColumn
          ),
          contents: [
            { value: '**' + keyword + '**' },
            { value: description }
          ]
        };
      }
    }
  });

  // 设置SQL格式化
  monaco.languages.registerDocumentFormattingEditProvider('sql', {
    provideDocumentFormattingEdits: (model) => {
      const text = model.getValue();
      const formatted = formatSQL(text);

      return [
        {
          range: model.getFullModelRange(),
          text: formatted
        }
      ];
    }
  });
}

// 简单的SQL格式化函数
function formatSQL(sql: string): string {
  return sql
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ',\n    ')
    .replace(/\s+(FROM|WHERE|ORDER BY|GROUP BY|HAVING|LIMIT|OFFSET)\s+/gi, '\n$1 ')
    .replace(/\s+(AND|OR)\s+/gi, '\n    $1 ')
    .replace(/\s+(INNER|LEFT|RIGHT|FULL) JOIN\s+/gi, '\n$1 JOIN ')
    .replace(/\s+ON\s+/gi, '\n    ON ')
    .trim();
}