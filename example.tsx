// src/client.tsx
import './example.css'
import { createRoot } from 'react-dom/client'

import * as a from './src/interface/expressions/conditions'
import * as b from './src/interface/expressions/select'
import * as c from './src/interface/functions/aggregate'
import * as e from './src/interface/column'
import * as f from './src/interface/introspect'
import * as g from './src/interface/compile'
import * as h from './src/interface/database'
import * as i from './src/interface/plan'
import * as j from './src/interface/sql'
import * as k from './src/interface/table'
import * as l from './src/interface/types'

Object.assign(window, a, b, c, e, f, g, h, i, j, k, l)

createRoot(document.getElementById('root')!).render('ok')
