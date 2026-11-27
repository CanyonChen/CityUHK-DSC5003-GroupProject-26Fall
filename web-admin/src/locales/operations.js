const messages = {
  'ops.orders': ['Orders', '订单', '訂單'],
  'ops.orderBook': ['Order book', '订单管理', '訂單管理'],
  'ops.ordersIntro': ['Search by order number or buyer to review payments and refunds.', '可按订单号或购票人搜索，查看付款和退款记录。', '可按訂單編號或購票人搜尋，查看付款及退款紀錄。'],
  'ops.refresh': ['Refresh', '刷新', '重新整理'],
  'ops.keyword': ['Keyword', '关键词', '關鍵字'],
  'ops.orderSearch': ['Order number or buyer', '订单号或购票人', '訂單編號或購票人'],
  'ops.status': ['Status', '状态', '狀態'],
  'ops.all': ['All', '全部', '全部'],
  'ops.performance': ['Performance', '场次', '場次'],
  'ops.from': ['From', '开始日期', '開始日期'],
  'ops.to': ['To', '结束日期', '結束日期'],
  'ops.clear': ['Clear', '清除', '清除'],
  'ops.loadingOrders': ['Loading orders…', '正在加载订单…', '正在載入訂單…'],
  'ops.noOrders': ['No orders match.', '没有符合条件的订单。', '沒有符合條件的訂單。'],
  'ops.order': ['Order', '订单', '訂單'],
  'ops.buyer': ['Buyer', '购票人', '購票人'],
  'ops.payment': ['Payment', '付款', '付款'],
  'ops.refund': ['Refund', '退款', '退款'],
  'ops.total': ['Total', '合计', '合計'],
  'ops.created': ['Created', '创建时间', '建立時間'],
  'ops.pager': ['{total} orders · page {page} / {pages}', '共 {total} 笔订单 · 第 {page} / {pages} 页', '共 {total} 筆訂單 · 第 {page} / {pages} 頁'],
  'ops.prev': ['Prev', '上一页', '上一頁'],
  'ops.next': ['Next', '下一页', '下一頁'],
  'ops.checkin': ['Check-in', '检票', '驗票'],
  'ops.gateIntro': ['Pick your performance, then enter or paste a ticket code. Each code works once.', '选择场次，再输入或粘贴票码。每个票码只可使用一次。', '選擇場次，再輸入或貼上票碼。每個票碼只可使用一次。'],
  'ops.loadingGates': ['Loading gate list…', '正在加载检票场次…', '正在載入驗票場次…'],
  'ops.noGates': ['No performances assigned to this account.', '此账号尚未获分配检票场次。', '此帳戶尚未獲分配驗票場次。'],
  'ops.gateWindow': ['Gate {start} – {end}', '检票时段 {start} 至 {end}', '驗票時段 {start} 至 {end}'],
  'ops.gateCount': ['{count} checked in', '已检票 {count} 张', '已驗票 {count} 張'],
  'ops.checkingFor': ['Checking in for', '当前检票场次', '目前驗票場次'],
  'ops.gateOpen': ['Gate is open', '可以检票', '可以驗票'],
  'ops.outsideWindow': ['Outside gate window', '当前不在检票时段内', '目前不在驗票時段內'],
  'ops.ticketCode': ['Ticket code', '票码', '票碼'],
  'ops.pasteCode': ['Paste QR payload or 64-char code', '粘贴二维码内容或 64 位票码', '貼上二維碼內容或 64 位票碼'],
  'ops.checking': ['Checking…', '正在检票…', '正在驗票…'],
  'ops.validate': ['Validate ticket', '检票', '驗票'],
  'ops.ticketAccepted': ['Ticket #{id} · checked at {time}', '门票 #{id} · 检票时间 {time}', '門票 #{id} · 驗票時間 {time}'],
  'ops.ticketRejected': ['Ticket not accepted', '未通过检票', '未能通過驗票'],
  'ops.firstCheckin': ['First checked in by {name} · {time}', '首次检票员 {name} · {time}', '首次驗票員 {name} · {time}'],
  'ops.latestCheckins': ['Latest check-ins', '最近检票记录', '最近驗票紀錄'],
  'ops.checkinTotal': ['{count} total', '共 {count} 条', '共 {count} 筆'],
  'ops.noCheckins': ['No check-ins recorded for this performance yet.', '本场次暂时没有检票记录。', '此場次暫時沒有驗票紀錄。'],
  'ops.checkedBy': ['Checked by {name}', '检票员：{name}', '驗票員：{name}'],
  'ops.TICKET_ALREADY_USED': ['This ticket has already been checked in.', '这张票已经检过。', '這張門票已經驗票。'],
  'ops.TICKET_INVALID': ['This code is not a valid ticket.', '票码无效。', '票碼無效。'],
  'ops.OUT_OF_WINDOW': ['The gate is outside its check-in window.', '当前不在此场次的检票时段内。', '目前不在此場次的驗票時段內。'],
  'ops.WRONG_PERFORMANCE': ['This ticket belongs to another performance.', '这张门票属于其他场次。', '這張門票屬於其他場次。'],
  'ops.FORBIDDEN': ['This account is not allowed to check in tickets.', '此账号没有检票权限。', '此帳戶沒有驗票權限。'],
  'ops.finance': ['Reconciliation', '对账', '對帳'],
  'ops.financeIntro': ['Sales ledger, gateway exceptions, refund progress and the audit trail.', '查看销售账目、支付网关异常、退款进度及操作记录。', '查看銷售帳目、付款閘道異常、退款進度及操作紀錄。'],
  'ops.autoRec': ['Auto reconciliation', '自动对账', '自動對帳'],
  'ops.frequency': ['Every {minutes} min', '每 {minutes} 分钟', '每 {minutes} 分鐘'],
  'ops.disabled': ['Disabled', '已停用', '已停用'],
  'ops.lastRun': ['Last run {time}', '上次运行：{time}', '上次執行：{time}'],
  'ops.never': ['Never run', '尚未运行', '尚未執行'],
  'ops.pending': ['Pending', '待处理', '待處理'],
  'ops.processed24': ['Processed 24h', '近 24 小时已处理', '過去 24 小時已處理'],
  'ops.failed24': ['Failed 24h', '近 24 小时失败', '過去 24 小時失敗'],
  'ops.running': ['Running…', '正在运行…', '正在執行…'],
  'ops.runNow': ['Run now', '立即运行', '立即執行'],
  'ops.financeNav': ['Financial records', '财务记录', '財務紀錄'],
  'ops.dismissMessage': ['{message} Dismiss message', '{message} 关闭提示', '{message} 關閉提示'],
  'ops.ledger': ['Sales ledger', '销售账目', '銷售帳目'],
  'ops.exceptions': ['Exceptions', '异常', '異常'],
  'ops.refunds': ['Refunds', '退款', '退款'],
  'ops.audit': ['Audit log', '审计日志', '審計紀錄'],
  'ops.loading': ['Loading…', '正在加载…', '正在載入…'],
  'ops.sold': ['Sold', '售出票数', '售出票數'],
  'ops.gross': ['Gross', '销售总额', '銷售總額'],
  'ops.refunded': ['Refunded', '已退款额', '已退款額'],
  'ops.net': ['Net', '净额', '淨額'],
  'ops.paymentExceptions': ['Payment exceptions', '付款异常', '付款異常'],
  'ops.openCount': ['{count} open', '待处理 {count} 项', '待處理 {count} 項'],
  'ops.noExceptions': ['No gateway exceptions.', '没有支付网关异常。', '沒有付款閘道異常。'],
  'ops.reconcile': ['Reconcile', '对账', '對帳'],
  'ops.refundProgress': ['Refund progress', '退款进度', '退款進度'],
  'ops.records': ['{count} records', '共 {count} 条记录', '共 {count} 筆紀錄'],
  'ops.noRefunds': ['No refund requests yet.', '暂无退款申请。', '暫時沒有退款申請。'],
  'ops.customerRequest': ['Customer request', '购票人申请', '購票人申請'],
  'ops.markSucceeded': ['Mark succeeded', '标记为退款成功', '標記為退款成功'],
  'ops.markFailed': ['Mark failed', '标记为退款失败', '標記為退款失敗'],
  'ops.auditTrail': ['Audit trail', '操作记录', '操作紀錄'],
  'ops.entries': ['{count} entries', '共 {count} 条记录', '共 {count} 筆紀錄'],
  'ops.time': ['Time', '时间', '時間'],
  'ops.actor': ['Actor', '操作人', '操作人'],
  'ops.action': ['Action', '操作', '操作'],
  'ops.object': ['Object', '操作对象', '操作對象'],
  'ops.result': ['Result', '结果', '結果'],
  'ops.recInProgress': ['A reconciliation run is already in progress.', '对账正在进行中。', '對帳正在進行中。'],
  'ops.recResult': ['Scanned {scanned} · applied {applied} · duplicates {duplicate} · failed {failed} · ignored {ignored}', '已检查 {scanned} 项 · 已处理 {applied} 项 · 重复 {duplicate} 项 · 失败 {failed} 项 · 已忽略 {ignored} 项', '已檢查 {scanned} 項 · 已處理 {applied} 項 · 重複 {duplicate} 項 · 失敗 {failed} 項 · 已略過 {ignored} 項'],
  'ops.paymentResult': ['Payment #{id} · {result}', '付款 #{id} · {result}', '付款 #{id} · {result}'],
  'ops.refundSuccessConfirm': ['Mark {order} as refunded? Tickets will be voided and the seats will become available again.', '确认将订单 {order} 标记为退款成功吗？门票将作废，座位将重新开售。', '確定將訂單 {order} 標記為退款成功嗎？門票將會作廢，座位將重新發售。'],
  'ops.refundFailureConfirm': ['Mark the refund for {order} as failed? The order will return to paid and the tickets will become valid again.', '确认将订单 {order} 标记为退款失败吗？订单将恢复为已付款，门票将重新生效。', '確定將訂單 {order} 標記為退款失敗嗎？訂單將恢復為已付款，門票將重新生效。'],
  'ops.refundResult': ['Refund #{id} · {refund}. Order status: {order}.', '退款 #{id} · {refund}。订单状态：{order}。', '退款 #{id} · {refund}。訂單狀態：{order}。'],
  'ops.refundReplayResult': ['Refund #{id} · {refund} (previously processed). Order status: {order}.', '退款 #{id} · {refund}（此前已处理）。订单状态：{order}。', '退款 #{id} · {refund}（早前已處理）。訂單狀態：{order}。'],
  'ops.ledgerEmpty': ['No sales to display.', '暂无销售记录。', '暫時沒有銷售紀錄。'],
  'ops.auditEmpty': ['No audit entries yet.', '暂无操作记录。', '暫時沒有操作紀錄。'],
  'ops.late': ['Late payment', '逾期到账', '逾期到帳'],
  'ops.unknown': ['Unknown', '状态不明', '狀態不明'],
  'ops.mismatch': ['Mismatch', '资料不符', '資料不符'],
  'ops.unprocessed': ['Unprocessed', '待处理', '待處理'],
  'ops.LATE_PAYMENT': ['Payment arrived late', '款项逾期到账', '款項逾期到帳'],
  'ops.PAYMENT_FAILED_OR_UNKNOWN': ['Payment failed or its outcome is unknown', '付款失败或结果不明', '付款失敗或結果不明'],
  'ops.rejectedNotice': ['Notification #{id} rejected', '通知 #{id} 已被拒绝', '通知 #{id} 已被拒絕'],
  'ops.pendingNotice': ['Notification #{id} pending', '通知 #{id} 待处理', '通知 #{id} 待處理'],
  'ops.refundRequestedReason': ['Customer requested a refund', '购票人申请退款', '購票人申請退款'],
  'ops.eventDateChanged': ['Event date changed', '活动日期变更', '活動日期更改'],
  'ops.gatewayDeclined': ['Gateway declined the refund', '支付网关拒绝退款', '付款閘道拒絕退款'],
  'ops.expiredPayment': ['Payment arrived after the order expired', '订单过期后收到款项', '訂單逾期後收到款項'],
  'ops.SYSTEM': ['System', '系统', '系統'],
  'ops.USER': ['User', '用户', '用戶'],
  'ops.ADMIN': ['Administrator', '管理员', '管理員'],
  'ops.CHECKER': ['Ticket checker', '检票员', '驗票員'],
  'ops.EVENT': ['Event', '活动', '活動'],
  'ops.PERFORMANCE': ['Performance', '场次', '場次'],
  'ops.PAYMENT': ['Payment', '付款', '付款'],
  'ops.ROLE': ['Role', '角色', '角色'],
  'ops.ORDER': ['Order', '订单', '訂單'],
  'ops.TICKET': ['Ticket', '门票', '門票'],
  'ops.REFUND': ['Refund', '退款', '退款'],
  'ops.SEAT': ['Seat', '座位', '座位'],
  'ops.PRICE': ['Price', '票价', '票價'],
  'ops.NULL': ['None', '无', '無'],
  'ops.REVOKED': ['Revoked', '已撤销', '已撤銷'],
  'ops.APPLIED': ['Applied', '已处理', '已處理'],
  'ops.STILL_UNKNOWN': ['Still unknown', '结果仍不明', '結果仍未確定'],
  'ops.DUPLICATE': ['Duplicate', '重复', '重複'],
  'ops.CREATE': ['Create', '创建', '建立'],
  'ops.GRANT': ['Grant role', '授予角色', '授予角色'],
  'ops.REVOKE': ['Revoke role', '撤销角色', '撤銷角色'],
  'ops.CHECKIN': ['Check in', '检票', '驗票'],
  'ops.ISSUE': ['Issue ticket', '出票', '發出門票'],
  'ops.NOTIFY_DUPLICATE': ['Duplicate notification', '重复通知', '重複通知'],
  'ops.PAYMENT_CONFIRMED': ['Payment confirmed', '已确认付款', '已確認付款'],
  'ops.PUBLISH': ['Publish', '发布', '發佈'],
  'ops.UPDATE': ['Update', '更新', '更新'],
  'ops.USER_REGISTERED': ['User registered', '用户注册', '用戶註冊'],
  'ops.AUTH_LOGOUT': ['Sign out', '退出登录', '登出'],
  'ops.ORDER_EXPIRED': ['Order expired', '订单过期', '訂單逾期'],
  'ops.ORDER_CREATED': ['Order created', '创建订单', '建立訂單'],
  'ops.ORDER_CANCELLED': ['Order cancelled', '取消订单', '取消訂單'],
  'ops.EVENT_CREATED': ['Event created', '创建活动', '建立活動'],
  'ops.EVENT_UPDATED': ['Event updated', '更新活动', '更新活動'],
  'ops.PERFORMANCE_CREATED': ['Performance created', '创建场次', '建立場次'],
  'ops.PERFORMANCE_UPDATED': ['Performance updated', '更新场次', '更新場次'],
  'ops.PERFORMANCE_PUBLISHED': ['Performance published', '发布场次', '發佈場次'],
  'ops.SALES_PAUSED': ['Sales paused', '暂停售票', '暫停售票'],
  'ops.SALES_RESUMED': ['Sales resumed', '恢复售票', '恢復售票'],
  'ops.PRICE_TIERS_UPDATED': ['Price tiers updated', '更新票价档位', '更新票價級別'],
  'ops.SEAT_BLOCKED': ['Seat blocked', '停用座位', '停用座位'],
  'ops.SEAT_AVAILABLE': ['Seat released', '开放座位', '開放座位'],
  'ops.SEATS_BLOCKED': ['Seats blocked', '批量停用座位', '批次停用座位'],
  'ops.SEATS_AVAILABLE': ['Seats released', '批量开放座位', '批次開放座位'],
  'ops.TICKET_CHECKED_IN': ['Ticket checked in', '门票已检票', '門票已驗票'],
  'ops.PAYMENT_RECONCILED': ['Payment reconciled', '付款已对账', '付款已對帳'],
  'ops.ORDER_PAID': ['Order paid', '订单已付款', '訂單已付款'],
  'ops.LATE_PAYMENT_REFUND': ['Late payment refund', '逾期付款退款', '逾期付款退款'],
  'ops.PAYMENT_CREATED': ['Payment created', '创建付款', '建立付款'],
  'ops.PAYMENT_FAILED': ['Payment failed', '付款失败', '付款失敗'],
  'ops.PAYMENT_NOTIFICATION_REJECTED': ['Payment notification rejected', '付款通知被拒绝', '付款通知被拒絕'],
  'ops.RECONCILE_FAILED': ['Reconciliation failed', '对账失败', '對帳失敗'],
  'ops.RECONCILE_RUN': ['Reconciliation run', '执行对账', '執行對帳'],
  'ops.REFUND_REQUESTED': ['Refund requested', '申请退款', '申請退款'],
  'ops.REFUND_SUCCEEDED': ['Refund succeeded', '退款成功', '退款成功'],
  'ops.REFUND_FAILED': ['Refund failed', '退款失败', '退款失敗'],
  'ops.ROLE_GRANTED': ['Role granted', '授予角色', '授予角色'],
  'ops.ROLE_REVOKED': ['Role revoked', '撤销角色', '撤銷角色'],
  'ops.tokensRevoked': ['Token version {version}; all existing sessions revoked', '令牌版本 {version}；所有既有会话已失效', '權杖版本 {version}；所有現有登入階段已失效'],
  'ops.releasedSeats': ['Released {count} seats', '已释放 {count} 个座位', '已釋出 {count} 個座位'],
  'ops.issuedTickets': ['Issued {count} tickets', '已发出 {count} 张门票', '已發出 {count} 張門票'],
  'ops.auditSeat': ['Seat {seat}', '座位 {seat}', '座位 {seat}'],
  'ops.auditPerformance': ['Performance #{id}', '场次 #{id}', '場次 #{id}'],
  'ops.auditEvent': ['Event #{id}', '活动 #{id}', '活動 #{id}'],
  'ops.auditVenue': ['Venue #{id}', '场地 #{id}', '場地 #{id}'],
  'ops.auditSeatCount': ['{count} seats', '{count} 个座位', '{count} 個座位'],
  'ops.auditTierCount': ['{count} price tiers', '{count} 个票价档位', '{count} 個票價級別'],
  'ops.auditTierUpdate': ['Submitted {count} price tiers', '已提交 {count} 个票价档位', '已提交 {count} 個票價級別'],
  'ops.auditCreated': ['Created event #{id}', '已创建活动 #{id}', '已建立活動 #{id}'],
  'ops.auditWindows': ['Venue {from} → {to}, time windows updated', '场地 {from} → {to}，已更新时间设置', '場地 {from} → {to}，已更新時段設定'],
  'ops.auditRegistered': ['Registered {name}', '已注册 {name}', '已註冊 {name}'],
  'ops.auditOrder': ['Order #{id}', '订单 #{id}', '訂單 #{id}'],
  'ops.auditRefund': ['Refund #{id}', '退款 #{id}', '退款 #{id}'],
  'ops.auditOrderStatus': ['Order {state}', '订单{state}', '訂單{state}'],
  'ops.auditSimFailed': ['Simulated payment failed', '模拟付款失败', '模擬付款失敗'],
  'ops.auditMismatch': ['Gateway transaction {txn}: amount, currency or order number mismatch', '网关交易 {txn}：金额、币种或订单编号不匹配', '閘道交易 {txn}：金額、貨幣或訂單編號不符'],
  'ops.auditPaymentResult': ['Payment: {result} · Order: {order} · Reconciliation: {reconcile}', '付款：{result} · 订单：{order} · 对账：{reconcile}', '付款：{result} · 訂單：{order} · 對帳：{reconcile}'],
  'ops.auditNotification': ['Notification #{id} · {message}', '通知 #{id} · {message}', '通知 #{id} · {message}'],
  'ops.auditRegion': ['Region {region}', '区域 {region}', '區域 {region}'],
  'ops.auditRow': ['Row {row}', '第 {row} 排', '第 {row} 排'],
  'ops.auditGrant': ['Granted {role} to user #{id}', '已向用户 #{id} 授予{role}角色', '已向用戶 #{id} 授予{role}角色'],
  'ops.auditRevoke': ['Revoked {role} from user #{id}', '已撤销用户 #{id} 的{role}角色', '已撤銷用戶 #{id} 的{role}角色'],
  'ops.auditReactivated': ['Reactivated', '已重新启用', '已重新啟用'],
  'ops.auditLate': ['Late payment; order remains expired', '逾期付款，订单仍为已过期', '逾期付款，訂單仍為已逾期'],
  'ops.auditTicketState': ['Tickets: {state}', '门票：{state}', '門票：{state}'],
  'ops.auditFields': ['Updated fields: {fields}', '更新字段：{fields}', '更新欄位：{fields}'],
  'ops.name': ['Name', '名称', '名稱'],
  'ops.organizer': ['Organizer', '主办方', '主辦單位'],
  'ops.description': ['Description', '简介', '簡介'],
  'ops.tags': ['Tags', '标签', '標籤'],
  'ops.cover': ['Cover', '封面', '封面'],
  'ops.none': ['None', '无', '無'],
};

export default messages;

export function operationName(identifier, t, status) {
  const key = 'ops.' + identifier;
  return Object.hasOwn(messages, key) ? t(key) : status(identifier);
}

const refundReasons = {
  'Customer requested a refund': 'refundRequestedReason',
  'Event date changed': 'eventDateChanged',
  'Gateway declined the refund': 'gatewayDeclined',
  'Payment arrived after the order expired': 'expiredPayment',
  LATE_PAYMENT: 'LATE_PAYMENT',
  PAYMENT_FAILED_OR_UNKNOWN: 'PAYMENT_FAILED_OR_UNKNOWN',
};

export function paymentReason(reason, t) {
  if (Object.hasOwn(refundReasons, reason)) return t('ops.' + refundReasons[reason]);
  const notice = /^NOTIFICATION_(\d+)_(REJECTED|PENDING)$/.exec(reason);
  return notice ? t(notice[2] === 'REJECTED' ? 'ops.rejectedNotice' : 'ops.pendingNotice', { id: notice[1] }) : reason;
}

// Match the server's structured summaries. Identifiers and free-text audit evidence stay intact.
const summaryPatterns = [
  [/^scanned (?<scanned>\d+), applied (?<applied>\d+), duplicate (?<duplicate>\d+), failed (?<failed>\d+), ignored (?<ignored>\d+)$/, 'recResult'],
  [/^token_version (?<version>\d+); all issued tokens revoked$/, 'tokensRevoked'],
  [/^event (?<id>\d+) created$/, 'auditCreated'],
  [/^venue (?<from>\d+)→(?<to>\d+), windows updated$/, 'auditWindows'],
  [/^registered (?<name>.+)$/, 'auditRegistered'],
  [/^provider txn (?<txn>.+?): amount, currency or order_no mismatch$/, 'auditMismatch'],
  [/^Simulated payment failed$/, 'auditSimFailed'],
];

const detailPatterns = [
  [/^released (?<count>\d+) seats$/, 'releasedSeats'],
  [/^(?<count>\d+) seats released$/, 'releasedSeats'],
  [/^issued (?<count>\d+) tickets$/, 'issuedTickets'],
  [/^performance (?<id>\d+)$/, 'auditPerformance'],
  [/^event (?<id>\d+)$/, 'auditEvent'],
  [/^venue (?<id>\d+)$/, 'auditVenue'],
  [/^seat (?<seat>.+)$/, 'auditSeat'],
  [/^(?<count>\d+) seats$/, 'auditSeatCount'],
  [/^(?<count>\d+) tiers$/, 'auditTierCount'],
  [/^(?<count>\d+) tiers submitted$/, 'auditTierUpdate'],
  [/^refund (?<id>\d+)$/, 'auditRefund'],
  [/^order (?<id>\d+)$/, 'auditOrder'],
];

function matchPhrase(text, patterns, t) {
  for (const [pattern, key] of patterns) {
    const match = pattern.exec(text);
    if (match) return t('ops.' + key, match.groups);
  }
  return null;
}

export function auditSummary(raw, t, status) {
  if (!raw) return '—';
  const name = (value) => operationName(value, t, status);
  const phrase = matchPhrase(raw, summaryPatterns, t);
  if (phrase) return phrase;

  // These patterns contain commas or free text of their own.
  if (raw.startsWith('fields: ')) {
    const fields = raw.slice(8).split(',').map((item) => {
      const aliases = { event_name: 'name', cover_url: 'cover' };
      const key = 'ops.' + (aliases[item] || item);
      return Object.hasOwn(messages, key) ? t(key) : item;
    });
    return t('ops.auditFields', { fields: fields.join(' / ') });
  }
  const payment = /^result=(\w+), order=(\w+), reconcile=(\w+)$/.exec(raw);
  if (payment) return t('ops.auditPaymentResult', { result: name(payment[1]), order: name(payment[2]), reconcile: name(payment[3]) });
  const notice = /^notification (\d+): (.+)$/.exec(raw);
  if (notice) return t('ops.auditNotification', { id: notice[1], message: notice[2] });
  const role = /^user (\d+) (granted|revoked) (\w+)(?: for performance (\d+))?( \(reactivated\))?$/.exec(raw);
  if (role) return [
    t(role[2] === 'granted' ? 'ops.auditGrant' : 'ops.auditRevoke', { id: role[1], role: name(role[3]) }),
    role[4] && t('ops.auditPerformance', { id: role[4] }),
    role[5] && t('ops.auditReactivated'),
  ].filter(Boolean).join(' · ');

  function detail(text) {
    const phrase = matchPhrase(text, detailPatterns, t);
    if (phrase) return phrase;
    // Preserve optional scoped performance IDs, e.g. CHECKER(P13,P14).
    const transition = /^(?:status )?([A-Z_]+|\d+)(\([P\d,]+\))?\s*(?:→|->)\s*([A-Z_]+|\d+)(\([P\d,]+\))?$/.exec(text);
    if (transition) return name(transition[1]) + (transition[2] || '') + ' → ' + name(transition[3]) + (transition[4] || '');
    const order = /^order (\d+) (.+)$/.exec(text);
    if (order) return t('ops.auditOrder', { id: order[1] }) + ' · ' + detail(order[2]);
    const orderState = /^order ([A-Z_]+)$/.exec(text);
    if (orderState) return t('ops.auditOrderStatus', { state: name(orderState[1]) });
    if (text === 'late payment kept EXPIRED') return t('ops.auditLate');
    const tickets = /^tickets (?:restored )?([A-Z_]+)$/.exec(text);
    if (tickets) return t('ops.auditTicketState', { state: name(tickets[1]) });
    const changedSeats = /^(\d+) seats → ([A-Z_]+)$/.exec(text);
    if (changedSeats) return t('ops.auditSeatCount', { count: changedSeats[1] }) + ' → ' + name(changedSeats[2]);
    const region = /^region (.+?)(?: row (\S+))?$/.exec(text);
    if (region) return [t('ops.auditRegion', { region: region[1] }), region[2] && t('ops.auditRow', { row: region[2] })].filter(Boolean).join(' · ');
    return /^[A-Z_]+$/.test(text) ? name(text) : text;
  }

  // Only comma + space is a separator. The comma in a scope such as (P13,P14) belongs to its identifier.
  const parts = raw.split(', ');
  const translated = parts.map(detail);
  return translated.some((part, i) => part !== parts[i]) ? translated.join(' · ') : raw;
}
