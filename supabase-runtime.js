(function () {
  const config = window.ETEMAD_SUPABASE_CONFIG || {};
  const labels = {
    pending: ['قيد الانتظار', 'waiting'],
    reviewing: ['قيد المراجعة', 'review'],
    in_progress: ['تحت التنفيذ', 'progress'],
    completed: ['مكتمل', 'done'],
    cancelled: ['ملغي', 'rejected'],
    rejected: ['مرفوض', 'rejected']
  };
  const state = { client: null, user: null, profile: null, services: [], orders: [], messages: [], notices: [], currentChat: '', loading: false, channel: null };
  const html = (value) => esc(value == null ? '' : value);
  const arabicStatus = (status) => labels[status] || ['قيد الانتظار', 'waiting'];
  const showError = (error, prefix) => {
    console.error(prefix, error);
    showToast(`${prefix}: ${error.message || 'تعذر إكمال العملية.'}`);
  };
  const currentRole = () => state.profile?.role || 'customer';
  const formatDate = (value) => value ? new Date(value).toLocaleDateString('ar-SA') : '—';
  const formatPrice = (value) => value == null ? 'يحدد بعد مراجعة الطلب' : `${Number(value).toLocaleString('ar-SA')} ر.س`;
  const renderSetup = (message) => {
    authRoot.hidden = false;
    appShell.hidden = true;
    authRoot.innerHTML = `<section class="auth-frame"><aside class="auth-aside"><div class="auth-brand"><span class="brand-mark">ع</span><span>اعتمد<small>إعداد اتصال آمن</small></span></div><div class="auth-message"><h1>خطوة واحدة<br><span>لتشغيل المنصة.</span></h1><p>اربط مشروع Supabase حتى تعمل الحسابات والطلبات والمرفقات والمحادثات على قاعدة بيانات حقيقية.</p></div></aside><section class="auth-content"><h2>يلزم إعداد Supabase</h2><p>${html(message || 'أضف رابط المشروع ومفتاح anon/public إلى ملف supabase-config.js بعد إنشاء المشروع وتشغيل مخطط قاعدة البيانات.')}</p><div class="secure-note">لا تضع مفتاح service_role أو كلمة مرور قاعدة البيانات في التطبيق. المفتاح العام فقط، مع سياسات RLS، مسموح هنا.</div><ol style="font-size:11px;line-height:2.1;color:var(--muted);padding-right:20px"><li>أنشئ مشروعًا في Supabase.</li><li>شغّل ملف <b>supabase/schema.sql</b> كاملاً من SQL Editor.</li><li>أضف رابط المشروع ومفتاح anon/public في <b>supabase-config.js</b>.</li><li>عطّل تأكيد البريد مؤقتًا للاختبار، أو أعد تهيئة رابط العودة للموقع المنشور.</li></ol><button class="primary" type="button" id="retrySupabase">إعادة المحاولة</button></section></section>`;
    document.getElementById('retrySupabase').addEventListener('click', () => location.reload());
  };
  const initClient = () => {
    const url = typeof config.url === 'string' ? config.url.trim() : '';
    const key = typeof config.anonKey === 'string' ? config.anonKey.trim() : '';
    if (!url || !key) {
      renderSetup('لا يوجد مشروع Supabase مرتبط بعد. أنشئ مشروعًا، شغّل مخطط قاعدة البيانات، ثم أضف رابط المشروع ومفتاح anon/public إلى supabase-config.js.');
      return false;
    }
    if (!window.supabase?.createClient) {
      renderSetup('تعذر تحميل مكتبة Supabase من شبكة التوزيع. تحقق من اتصال الإنترنت وأعد تحميل الصفحة.');
      return false;
    }
    if (key.startsWith('sb_secret_') || key.startsWith('service_role')) {
      renderSetup('المفتاح المُدخل مفتاح سري ولا يمكن استخدامه في المتصفح. استخدم مفتاح anon/public فقط.');
      return false;
    }
    try {
      new URL(url);
      state.client = window.supabase.createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      window.etemadSupabase = state.client;
      return true;
    } catch (error) {
      renderSetup(`إعدادات Supabase غير صالحة: ${error.message}`);
      return false;
    }
  };
  const getProfile = async (user) => {
    const { data, error } = await state.client.from('profiles')
      .select('id,full_name,phone,role,provider_status,office_name')
      .eq('id', user.id).single();
    if (error) throw error;
    return data;
  };
  const getServices = async () => {
    const { data, error } = await state.client.from('services')
      .select('id,slug,name,description,price_sar,duration,requirements,sort_order,category:service_categories(name,icon)')
      .eq('is_active', true).order('sort_order').order('name');
    if (error) throw error;
    state.services = data.map((item) => ({
      id: item.id, slug: item.slug, name: item.name,
      group: item.category?.name || 'خدمات أخرى', icon: item.category?.icon || 'خ',
      desc: item.description, price: item.price_sar, duration: item.duration, requirements: item.requirements || []
    }));
    services.splice(0, services.length, ...state.services);
  };
  const refreshOrders = async () => {
    if (!state.user) return;
    const { data, error } = await state.client.from('orders')
      .select('id,order_number,customer_id,provider_id,service_id,status,details,quoted_price_sar,admin_note,created_at,service:services(name,price_sar),provider:profiles!orders_provider_id_fkey(full_name)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    state.orders = data.map((row) => {
      const [status, tone] = arabicStatus(row.status);
      return { ...row, id: row.order_number, uuid: row.id, service: row.service?.name || 'خدمة', status, statusCode: row.status, tone, date: formatDate(row.created_at) };
    });
    orders = state.orders;
  };
  const refreshNotices = async () => {
    if (!state.user) return;
    const { data, error } = await state.client.from('notifications').select('id,title,body,read_at,created_at,order_id')
      .order('created_at', { ascending: false }).limit(40);
    if (error) throw error;
    state.notices = data;
  };
  const prepareUser = async (user) => {
    state.user = user;
    state.profile = await getProfile(user);
    currentUser = { id: user.id, email: user.email, profile: { name: state.profile.full_name, phone: state.profile.phone, email: user.email, identity: '' } };
    await Promise.all([getServices(), refreshOrders(), refreshNotices()]);
    authRoot.hidden = true;
    appShell.hidden = false;
    activeView = 'home';
    adminMode = state.profile.role === 'admin';
    document.getElementById('adminToggle').hidden = !adminMode;
    document.getElementById('logoutButton').hidden = false;
    render();
    subscribeRealtime();
  };
  const subscribeRealtime = () => {
    if (state.channel) state.client.removeChannel(state.channel);
    state.channel = state.client.channel(`etemad-${state.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async () => {
        try { await refreshOrders(); render(); } catch (error) { showError(error, 'تعذر تحديث الطلبات'); }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_messages' }, (payload) => {
        if (payload.new.order_id !== state.currentChat) return;
        state.messages.push(payload.new);
        drawMessages();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${state.user.id}` }, async () => {
        try { await refreshNotices(); render(); } catch (error) { showError(error, 'تعذر تحديث الإشعارات'); }
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') showToast('تعذر الاتصال اللحظي؛ يمكنك تحديث الصفحة للمحاولة.');
      });
  };
  const signInApp = async (email, password) => {
    const { data, error } = await state.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await prepareUser(data.user);
    showToast('تم تسجيل الدخول.');
  };
  const signOutApp = async () => {
    const { error } = await state.client.auth.signOut();
    if (error) throw error;
    state.user = null; state.profile = null; state.orders = []; state.messages = [];
    if (state.channel) await state.client.removeChannel(state.channel);
    state.channel = null;
    showAuth('login');
  };
  const showLegacyAuth = showAuth;
  showAuth = function (mode = 'login', message = '') {
    showLegacyAuth(mode, message);
    if (mode !== 'register') return;
    const form = document.getElementById('registerForm');
    if (!form) return;
    form.insertAdjacentHTML('afterbegin', `<div class="field"><label for="accountRole">نوع الحساب</label><select id="accountRole" required><option value="customer">عميل</option><option value="provider">مقدم خدمة — يتطلب موافقة الإدارة</option></select></div><div class="field" id="officeNameField" hidden><label for="officeName">اسم المكتب أو النشاط</label><input id="officeName" autocomplete="organization" placeholder="اسم المكتب"></div>`);
    document.getElementById('accountRole').addEventListener('change', (event) => {
      document.getElementById('officeNameField').hidden = event.target.value !== 'provider';
      document.getElementById('officeName').required = event.target.value === 'provider';
    });
  };
  requestRows = function (items = state.orders) {
    return items.map((order) => `<div class="request-row"><div><span class="request-name">${html(order.service)}</span><span class="request-id">${html(order.id)}</span></div><span class="request-meta">${html(order.date)}</span>${statusHtml(order.status, order.tone)}<button class="text-link" data-order="${html(order.id)}">التفاصيل</button></div>`).join('') || '<div class="empty-state">لا توجد طلبات مسجلة بعد.</div>';
  };
  dashboard = function () {
    if (currentRole() === 'provider') return providerDashboard();
    const running = state.orders.filter((order) => ['reviewing', 'in_progress'].includes(order.statusCode)).length;
    const completed = state.orders.filter((order) => order.statusCode === 'completed').length;
    return `<div class="welcome"><div><h1>مرحبًا ${html(state.profile?.full_name || 'بك')}،</h1><p>أنجز معاملاتك وتابعها من حسابك الآمن.</p></div><button class="primary" data-action="new-request">＋ طلب خدمة جديدة</button></div><div class="stats"><article class="stat"><div class="stat-top"><span>إجمالي الطلبات</span><span class="stat-icon">▤</span></div><strong>${state.orders.length}<small>طلب</small></strong></article><article class="stat"><div class="stat-top"><span>قيد التنفيذ</span><span class="stat-icon">◷</span></div><strong>${running}<small>طلبات</small></strong></article><article class="stat"><div class="stat-top"><span>طلبات مكتملة</span><span class="stat-icon">✓</span></div><strong>${completed}<small>طلبات</small></strong></article><article class="stat"><div class="stat-top"><span>غير مقروءة</span><span class="stat-icon">♧</span></div><strong>${state.notices.filter((notice) => !notice.read_at).length}<small>إشعارات</small></strong></article></div><div class="dashboard-grid"><div><section class="panel"><div class="panel-head"><div><h2>الخدمات</h2><p>اختر الخدمة وأرسل طلبك</p></div><button class="text-link" data-view="services">عرض الخدمات ←</button></div><div class="service-grid">${state.services.slice(0, 8).map((item) => `<article class="service-card" data-service="${html(item.id)}" tabindex="0"><span class="service-symbol">${html(item.icon)}</span><b>${html(item.name)}</b><small>${html(item.group)}</small></article>`).join('')}</div></section><section class="panel"><div class="panel-head"><div><h2>آخر الطلبات</h2><p>الطلبات المسجلة في حسابك</p></div><button class="text-link" data-view="orders">عرض الكل ←</button></div><div class="request-list">${requestRows(state.orders.slice(0, 5))}</div></section></div><section class="panel"><div class="panel-head"><div><h2>تحديثاتك</h2><p>إشعارات مرتبطة بحسابك</p></div><button class="text-link" data-view="notifications">الكل</button></div>${noticeMarkup(state.notices.slice(0, 5))}</section></div>`;
  };
  serviceCatalog = function () {
    const filtered = state.services.filter((service) => (selectedCategory === 'الكل' || service.group === selectedCategory) && `${service.name} ${service.group} ${service.desc}`.includes(searchText));
    const categories = ['الكل', ...new Set(state.services.map((service) => service.group))];
    return `${pageHeading('الخدمات', 'خدمات وأسعار محدثة من إدارة اعتمد.')}<div class="toolbar"><label class="search"><span>⌕</span><input id="serviceSearch" type="search" placeholder="ابحث عن خدمة..." value="${html(searchText)}"></label><select class="select" id="categorySelect">${categories.map((category) => `<option ${category === selectedCategory ? 'selected' : ''}>${html(category)}</option>`).join('')}</select></div><div class="service-catalog">${filtered.map((service) => `<article class="catalog-card"><span class="service-symbol">${html(service.icon)}</span><h3>${html(service.name)}</h3><p>${html(service.desc)}</p><p>${formatPrice(service.price)}${service.duration ? ` · ${html(service.duration)}` : ''}</p><button class="primary small" data-service="${html(service.id)}">اطلب الخدمة&nbsp; ←</button></article>`).join('') || '<div class="empty-state">لا توجد خدمات تطابق بحثك.</div>'}</div>`;
  };
  ordersPage = function () {
    return `${pageHeading('طلباتي', 'حالات طلباتك محدثة مباشرة من قاعدة البيانات.')}<div class="panel"><div class="toolbar"><label class="search"><span>⌕</span><input id="orderSearch" type="search" placeholder="ابحث برقم الطلب أو الخدمة..."></label><select class="select" id="orderFilter"><option>كل الحالات</option>${['pending','reviewing','in_progress','completed','cancelled','rejected'].map((key) => `<option>${arabicStatus(key)[0]}</option>`).join('')}</select><button class="primary small" data-action="new-request">＋ طلب جديد</button></div><div class="request-list" id="ordersList">${requestRows()}</div></div>`;
  };
  const noticeMarkup = (items) => items.map((notice) => `<article class="notice" data-notification="${html(notice.id)}" tabindex="0"><span class="notice-symbol">♧</span><div><b>${html(notice.title)}</b><p>${html(notice.body)}</p><time>${formatDate(notice.created_at)}</time>${notice.read_at ? '' : '<small> · غير مقروء</small>'}</div></article>`).join('') || '<p class="empty-state">لا توجد إشعارات.</p>';
  notificationsPage = function () {
    return `${pageHeading('الإشعارات', 'إشعارات وتحديثات حسابك من المنصة.')}<section class="panel"><div class="notice-list">${noticeMarkup(state.notices)}</div></section>`;
  };
  paymentsPage = function () {
    return `${pageHeading('الدفع', 'تواصل عبر واتساب مع إدارة اعتمد لإتمام الدفع بعد مراجعة طلبك.')}<section class="panel"><div class="panel-head"><h2>الطلبات التي تنتظر التسعير أو الدفع</h2></div><div class="request-list">${requestRows(state.orders.filter((order) => !['completed', 'cancelled', 'rejected'].includes(order.statusCode)))}</div><p class="secure-note">لا تُدخل بيانات البطاقة البنكية في التطبيق. التحويل البنكي يتم بعد التواصل والتأكد من مبلغ الطلب.</p></section>`;
  };
  appointmentsPage = function () {
    return `${pageHeading('المواعيد', 'خدمة المواعيد غير مفعلة حالياً؛ لا توجد مواعيد وهمية محفوظة.')}<section class="panel"><p class="empty-state">لا توجد مواعيد مسجلة. تواصل مع الدعم لطلب موعد.</p><button class="primary" data-action="new-chat">التواصل مع الدعم</button></section>`;
  };
  supportPage = function () {
    const available = state.orders.filter((order) => currentRole() === 'admin' || order.customer_id === state.user.id || order.provider_id === state.user.id);
    return `${pageHeading('المحادثات', 'محادثة مرتبطة بطلبك، متاحة لك ولمقدم الخدمة المعيّن والإدارة.')}<section class="panel"><div class="toolbar"><label for="chatOrder">الطلب</label><select id="chatOrder" class="select">${available.map((order) => `<option value="${html(order.uuid)}" ${order.uuid === state.currentChat ? 'selected' : ''}>${html(order.id)} — ${html(order.service)}</option>`).join('')}</select></div><div id="chatMessages" class="chat-messages"></div><form id="chatForm" class="chat-compose"><textarea id="chatBody" maxlength="4000" placeholder="اكتب رسالة أو أرفق ملفاً..."></textarea><input id="chatFile" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"><button class="primary" type="submit">إرسال</button></form><p class="secure-note">المرفقات خاصة ويقتصر الوصول إليها على المشاركين المصرّح لهم في الطلب.</p></section>`;
  };
  const providerDashboard = () => {
    const approved = state.profile?.provider_status === 'approved';
    const mine = state.orders.filter((order) => order.provider_id === state.user.id);
    const available = state.orders.filter((order) => !order.provider_id && order.statusCode === 'pending');
    return `<div class="welcome"><div><h1>لوحة مقدم الخدمة</h1><p>${approved ? 'الطلبات المتاحة وتحديثات طلباتك.' : `حساب مقدم الخدمة بانتظار الاعتماد (${html(state.profile?.provider_status)}).`}</p></div></div><div class="stats"><article class="stat"><div class="stat-top"><span>طلبات مسندة إليك</span><span class="stat-icon">▤</span></div><strong>${mine.length}<small>طلب</small></strong></article><article class="stat"><div class="stat-top"><span>مكتملة</span><span class="stat-icon">✓</span></div><strong>${mine.filter((order) => order.statusCode === 'completed').length}<small>طلبات</small></strong></article></div><section class="panel"><div class="panel-head"><h2>طلبات متاحة</h2></div>${approved ? `<div class="request-list">${available.map((order) => `<div class="request-row"><div><b>${html(order.service)}</b><small class="request-id">${html(order.id)}</small></div><span>${html(order.date)}</span><button class="primary small" data-claim-order="${html(order.uuid)}">استلام الطلب</button></div>`).join('') || '<p class="empty-state">لا توجد طلبات متاحة حالياً.</p>'}</div>` : '<p class="empty-state">ستظهر الطلبات بعد موافقة الإدارة على حساب مقدم الخدمة.</p>'}</section><section class="panel"><div class="panel-head"><h2>طلباتي المسندة</h2></div><div class="request-list">${mine.map((order) => `<div class="request-row"><div><b>${html(order.service)}</b><small class="request-id">${html(order.id)}</small></div>${statusHtml(order.status, order.tone)}<button class="secondary small" data-open-chat="${html(order.uuid)}">المحادثة</button>${order.statusCode === 'reviewing' ? `<button class="primary small" data-provider-status="${html(order.uuid)}" data-next-status="in_progress">بدء التنفيذ</button>` : ''}${order.statusCode === 'in_progress' ? `<button class="primary small" data-provider-status="${html(order.uuid)}" data-next-status="completed">إكمال الطلب</button>` : ''}</div>`).join('') || '<p class="empty-state">لا توجد طلبات مسندة إليك.</p>'}</div></section>`;
  };
  adminPage = function () {
    if (currentRole() !== 'admin') return `${pageHeading('غير مصرح', 'تتطلب هذه الصفحة صلاحية إدارية من قاعدة البيانات.')}`;
    const providers = state.adminProfiles || [];
    const allOrders = state.adminOrders || state.orders;
    return `<div class="admin-banner"><b>لوحة إدارة متصلة بقاعدة البيانات</b><br>الصلاحيات محمية أيضاً بسياسات RLS في Supabase.</div><div class="stats"><article class="stat"><div class="stat-top"><span>العملاء</span><span class="stat-icon">◎</span></div><strong>${providers.filter((person) => person.role === 'customer').length}</strong></article><article class="stat"><div class="stat-top"><span>مقدمو الخدمات</span><span class="stat-icon">◈</span></div><strong>${providers.filter((person) => person.role === 'provider').length}</strong></article><article class="stat"><div class="stat-top"><span>الطلبات</span><span class="stat-icon">▤</span></div><strong>${allOrders.length}</strong></article><article class="stat"><div class="stat-top"><span>الخدمات النشطة</span><span class="stat-icon">▦</span></div><strong>${state.adminServices?.filter((service) => service.is_active).length || 0}</strong></article></div><section class="panel"><div class="panel-head"><h2>مقدمو الخدمة</h2></div><div class="request-list">${providers.filter((person) => person.role === 'provider').map((person) => `<div class="request-row"><div><b>${html(person.office_name || person.full_name)}</b><small class="request-id">${html(person.provider_status)}</small></div><span>${html(person.phone)}</span>${person.provider_status === 'pending' ? `<button class="primary small" data-provider-approve="${html(person.id)}">موافقة</button>` : `<button class="ghost small" data-provider-suspend="${html(person.id)}">إيقاف / رفض</button>`}</div>`).join('') || '<p class="empty-state">لا يوجد مقدمو خدمة مسجلون.</p>'}</div></section><section class="panel"><div class="panel-head"><h2>إدارة الطلبات</h2></div><div class="request-list">${allOrders.map((order) => `<div class="request-row"><div><b>${html(order.order_number)}</b><small class="request-id">${html(order.service?.name || order.service)}</small></div><select class="select" data-order-status="${html(order.id)}">${['pending','reviewing','in_progress','completed','cancelled','rejected'].map((status) => `<option value="${status}" ${order.status === status ? 'selected' : ''}>${html(arabicStatus(status)[0])}</option>`).join('')}</select><button class="text-link" data-order="${html(order.order_number)}">التفاصيل</button></div>`).join('') || '<p class="empty-state">لا توجد طلبات.</p>'}</div></section><section class="panel"><div class="panel-head"><h2>الخدمات والأسعار</h2><button class="primary small" data-action="admin-add-service">إضافة خدمة</button></div><div class="request-list">${(state.adminServices || []).map((service) => `<div class="request-row"><div><b>${html(service.name)}</b><small class="request-id">${formatPrice(service.price_sar)}</small></div><button class="ghost small" data-service-price="${html(service.id)}">تعديل السعر</button><button class="text-link" data-service-toggle="${html(service.id)}">${service.is_active ? 'إخفاء' : 'إظهار'}</button></div>`).join('')}</div></section>`;
  };
  const drawLegacy = render;
  render = function () {
    drawLegacy();
    const noticeBadge = document.querySelector('#sideNav [data-view="notifications"] .nav-count');
    if (noticeBadge) {
      const unread = state.notices.filter((notice) => !notice.read_at).length;
      noticeBadge.textContent = String(unread);
      noticeBadge.hidden = unread === 0;
    }
    const noticeDot = document.querySelector('.top-actions [data-view="notifications"] .notify-dot');
    if (noticeDot) noticeDot.hidden = state.notices.every((notice) => notice.read_at);
    document.querySelectorAll('#sideNav [data-view="admin"], #mobileNav [data-view="admin"]').forEach((item) => { item.hidden = currentRole() !== 'admin'; });
  };
  const loadAdmin = async () => {
    if (currentRole() !== 'admin') throw new Error('لا تملك صلاحية الإدارة.');
    const [profiles, allOrders, allServices] = await Promise.all([
      state.client.from('profiles').select('id,full_name,phone,role,provider_status,office_name').order('created_at', { ascending: false }),
      state.client.from('orders').select('id,order_number,customer_id,provider_id,status,created_at,service:services(name)').order('created_at', { ascending: false }),
      state.client.from('services').select('id,name,price_sar,is_active').order('name')
    ]);
    for (const result of [profiles, allOrders, allServices]) if (result.error) throw result.error;
    state.adminProfiles = profiles.data;
    state.adminOrders = allOrders.data;
    state.adminServices = allServices.data;
  };
  const actualOrder = (id) => state.orders.find((order) => order.id === id || order.uuid === id) || state.adminOrders?.find((order) => order.order_number === id);
  newRequest = function (serviceId = '') {
    openModal('طلب خدمة', `<form id="requestForm"><div class="form-grid"><div class="field full"><label for="requestService">الخدمة</label><select id="requestService" required><option value="">اختر الخدمة</option>${state.services.map((service) => `<option value="${html(service.id)}" ${service.id === serviceId ? 'selected' : ''}>${html(service.group)} · ${html(service.name)} (${formatPrice(service.price)})</option>`).join('')}</select></div><div class="field full"><label for="requestDetails">تفاصيل الطلب ومتطلباته</label><textarea id="requestDetails" maxlength="4000" required placeholder="اشرح ما تحتاج إليه. لا ترسل كلمات مرور أو بيانات بنكية."></textarea></div><div class="field full"><label for="requestFiles">المرفقات (صور أو PDF، حتى 10 ميغابايت للملف)</label><input id="requestFiles" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple></div></div><p class="secure-note">تُخزّن المرفقات في مساحة خاصة، ولا يراها إلا المشاركون المصرح لهم في الطلب.</p><div class="modal-actions"><button class="primary" type="submit">إرسال الطلب</button><button class="ghost" type="button" data-modal-close>إلغاء</button></div></form>`);
  };
  orderDetails = function (id) {
    const order = actualOrder(id);
    if (!order) return;
    const [status, tone] = arabicStatus(order.statusCode || order.status);
    const orderNo = order.order_number || order.id;
    openModal('تفاصيل الطلب', `<div class="appointment"><div class="date-chip"><b>▤</b><small>${html(formatDate(order.created_at))}</small></div><div><strong>${html(order.service?.name || order.service)}</strong><p>رقم الطلب ${html(orderNo)}</p></div></div><div style="margin:17px 0">${statusHtml(status, tone)}</div><p>${html(order.details || '')}</p><p>السعر: <b>${formatPrice(order.quoted_price_sar ?? order.service?.price_sar)}</b></p>${order.admin_note ? `<div class="secure-note">${html(order.admin_note)}</div>` : ''}<section class="panel"><div class="panel-head"><h3>المرفقات</h3></div><div id="orderFiles">جارٍ تحميل الملفات…</div><form id="addOrderFile" class="chat-compose"><input id="orderFile" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required><button class="secondary" type="submit">إرفاق ملف</button></form></section><div class="modal-actions"><button class="secondary" data-open-chat="${html(order.uuid || order.id)}">محادثة الطلب</button><a class="primary" target="_blank" rel="noopener noreferrer" href="${html(paymentWhatsAppUrl({ service: order.service?.name || order.service }))}">التواصل لإتمام الدفع عبر واتساب</a></div>`);
    if (order.uuid) loadOrderFiles(order.uuid);
  };
  const safeFileName = (name) => name.normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(-90) || 'file';
  const uploadFile = async (file, orderId) => {
    if (file.size > 10 * 1024 * 1024) throw new Error('يجب ألا يتجاوز الملف 10 ميغابايت.');
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) throw new Error('نوع الملف غير مسموح. استخدم صورة JPG/PNG/WebP أو PDF.');
    const path = `${state.user.id}/${orderId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error } = await state.client.storage.from('order-files').upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return path;
  };
  const handleSubmit = async (event) => {
    const form = event.target;
    if (!['loginForm', 'registerForm', 'forgotForm', 'requestForm', 'profileForm', 'chatForm', 'addOrderFile', 'appointmentForm'].includes(form.id)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      if (form.id === 'loginForm') {
        await signInApp(document.getElementById('authEmail').value.trim(), document.getElementById('authPassword').value);
      } else if (form.id === 'forgotForm') {
        const { error } = await state.client.auth.resetPasswordForEmail(document.getElementById('authEmail').value.trim(), { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        showAuth('login', 'إذا كان البريد مسجلاً فستصلك رسالة استعادة. افحص البريد غير المرغوب فيه أيضاً.');
      } else if (form.id === 'registerForm') {
        const name = document.getElementById('authName').value.trim();
        const phone = document.getElementById('authPhone').value.trim();
        const email = document.getElementById('authEmail').value.trim();
        const password = document.getElementById('authPassword').value;
        if (password !== document.getElementById('authConfirm').value) throw new Error('كلمتا المرور غير متطابقتين.');
        const role = document.getElementById('accountRole').value;
        const office = document.getElementById('officeName')?.value.trim() || '';
        if (role === 'provider' && !office) throw new Error('أدخل اسم المكتب أو النشاط.');
        const { data, error } = await state.client.auth.signUp({
          email, password, options: { data: { full_name: name, phone, role, office_name: office }, emailRedirectTo: location.origin + location.pathname }
        });
        if (error) throw error;
        if (data.session) {
          await prepareUser(data.user);
          showToast(role === 'provider' ? 'تم إنشاء الحساب؛ سيصبح نشطاً بعد اعتماد الإدارة.' : 'تم إنشاء حسابك بنجاح.');
        } else showAuth('login', 'أرسلنا رابط تأكيد إلى بريدك. أكّد الحساب ثم سجّل الدخول.');
      } else if (form.id === 'requestForm') {
        const serviceId = document.getElementById('requestService').value;
        const details = document.getElementById('requestDetails').value.trim();
        const files = [...document.getElementById('requestFiles').files];
        if (files.some((file) => file.size > 10 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type))) throw new Error('تحقق من حجم المرفقات وأنواعها (صور مسموحة أو PDF، حتى 10 ميغابايت).');
        const { data: order, error } = await state.client.from('orders').insert({ customer_id: state.user.id, service_id: serviceId, details }).select('id,order_number').single();
        if (error) throw error;
        for (const file of files) {
          const storagePath = await uploadFile(file, order.id);
          const { error: fileError } = await state.client.from('order_files').insert({ order_id: order.id, uploaded_by: state.user.id, storage_path: storagePath, file_name: file.name, content_type: file.type, size_bytes: file.size });
          if (fileError) throw fileError;
        }
        await refreshOrders();
        closeModal(); activeView = 'orders'; render();
        showToast(`تم إنشاء الطلب ${order.order_number}.`);
      } else if (form.id === 'profileForm') {
        const inputs = form.querySelectorAll('input');
        const { error } = await state.client.from('profiles').update({ full_name: inputs[0].value.trim(), phone: inputs[1].value.trim() }).eq('id', state.user.id);
        if (error) throw error;
        state.profile = await getProfile(state.user);
        await state.client.auth.updateUser({ data: { full_name: state.profile.full_name, phone: state.profile.phone } });
        render(); showToast('تم حفظ بياناتك في حسابك.');
      } else if (form.id === 'chatForm') {
        if (!state.currentChat) throw new Error('أنشئ طلباً أولاً لبدء محادثة مرتبطة به.');
        const body = document.getElementById('chatBody').value.trim();
        const file = document.getElementById('chatFile').files[0];
        if (!body && !file) throw new Error('اكتب رسالة أو أرفق ملفاً قبل الإرسال.');
        let attachmentPath = null;
        if (file) attachmentPath = await uploadFile(file, state.currentChat);
        const { error } = await state.client.from('order_messages').insert({ order_id: state.currentChat, sender_id: state.user.id, body, attachment_path: attachmentPath, attachment_name: file?.name || null });
        if (error) throw error;
        form.reset();
        await loadMessages();
      } else if (form.id === 'addOrderFile') {
        const order = actualOrder(document.getElementById('modalBody').querySelector('[data-open-chat]')?.dataset.openChat);
        const file = document.getElementById('orderFile').files[0];
        if (!order?.uuid || !file) throw new Error('تعذر تحديد الطلب أو الملف.');
        const storagePath = await uploadFile(file, order.uuid);
        const { error } = await state.client.from('order_files').insert({ order_id: order.uuid, uploaded_by: state.user.id, storage_path: storagePath, file_name: file.name, content_type: file.type, size_bytes: file.size });
        if (error) throw error;
        document.getElementById('addOrderFile').reset();
        await loadOrderFiles(order.uuid);
        showToast('تم رفع المرفق الخاص بالطلب.');
      } else if (form.id === 'appointmentForm') {
        throw new Error('خدمة المواعيد غير متاحة بعد؛ لم يتم حفظ موعد وهمي.');
      }
    } catch (error) { showError(error, 'تعذر إكمال العملية'); }
  };
  document.addEventListener('submit', (event) => {
    if (event.target.id === 'passwordResetForm') {
      event.preventDefault(); event.stopImmediatePropagation();
      (async () => {
        const { error } = await state.client.auth.updateUser({ password: document.getElementById('newPassword').value });
        if (error) throw error;
        showToast('تم تحديث كلمة المرور. سجّل الدخول مجدداً.');
        await signOutApp();
      })()
        .catch((error) => showError(error, 'تعذر تحديث كلمة المرور'));
      return;
    }
    handleSubmit(event);
  }, true);
  document.addEventListener('click', async (event) => {
    const target = event.target.closest('button,a,[data-service],[data-notification]');
    if (!target) return;
    if (target.dataset.notification) {
      try {
        const { error } = await state.client.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', target.dataset.notification);
        if (error) throw error;
        await refreshNotices(); render();
      } catch (error) { showError(error, 'تعذر تحديث الإشعار'); }
      return;
    }
    if (target.id === 'logoutButton') {
      event.preventDefault(); event.stopImmediatePropagation();
      try { await signOutApp(); } catch (error) { showError(error, 'تعذر تسجيل الخروج'); }
      return;
    }
    if (target.id === 'adminToggle') {
      event.preventDefault(); event.stopImmediatePropagation();
      if (currentRole() !== 'admin') return showToast('لا تملك صلاحية الإدارة.');
      try { await loadAdmin(); adminMode = true; activeView = 'admin'; render(); } catch (error) { showError(error, 'تعذر تحميل لوحة الإدارة'); }
      return;
    }
    if (target.id === 'themeToggle') {
      event.preventDefault(); event.stopImmediatePropagation();
      theme = theme === 'dark' ? 'light' : 'dark';
      document.body.classList.toggle('dark', theme === 'dark');
      document.body.classList.toggle('luxe-light', theme === 'light');
      localStorage.setItem('etemad-theme', theme);
      return;
    }
    if (target.dataset.claimOrder) {
      event.preventDefault(); event.stopImmediatePropagation();
      try {
        const { error } = await state.client.rpc('claim_order', { target_order: target.dataset.claimOrder });
        if (error) throw error;
        await refreshOrders(); render(); showToast('تم استلام الطلب وأصبح مسنداً إليك وحدك.');
      } catch (error) { showError(error, 'تعذر استلام الطلب'); }
      return;
    }
    if (target.dataset.openChat) {
      event.preventDefault(); event.stopImmediatePropagation();
      const order = actualOrder(target.dataset.openChat);
      state.currentChat = order?.uuid || order?.id || target.dataset.openChat;
      closeModal(); activeView = 'support'; render(); await loadMessages();
      return;
    }
    if (target.dataset.providerApprove || target.dataset.providerSuspend) {
      event.preventDefault(); event.stopImmediatePropagation();
      const id = target.dataset.providerApprove || target.dataset.providerSuspend;
      const provider_status = target.dataset.providerApprove ? 'approved' : 'suspended';
      try {
        const { error } = await state.client.rpc('admin_set_provider_status', { provider_uuid: id, new_status: provider_status });
        if (error) throw error;
        await loadAdmin(); render(); showToast('تم تحديث حالة مقدم الخدمة.');
      } catch (error) { showError(error, 'تعذر تحديث مقدم الخدمة'); }
      return;
    }
    if (target.dataset.providerStatus) {
      event.preventDefault(); event.stopImmediatePropagation();
      try {
        const { error } = await state.client.rpc('provider_update_order_status', { target_order: target.dataset.providerStatus, new_status: target.dataset.nextStatus });
        if (error) throw error;
        await refreshOrders(); render(); showToast('تم تحديث حالة الطلب.');
      } catch (error) { showError(error, 'تعذر تحديث حالة الطلب'); }
      return;
    }
    if (target.dataset.serviceToggle) {
      event.preventDefault(); event.stopImmediatePropagation();
      const service = state.adminServices.find((row) => row.id === target.dataset.serviceToggle);
      try {
        const { error } = await state.client.from('services').update({ is_active: !service.is_active }).eq('id', service.id);
        if (error) throw error;
        await loadAdmin(); await getServices(); render(); showToast('تم تحديث ظهور الخدمة.');
      } catch (error) { showError(error, 'تعذر تحديث الخدمة'); }
      return;
    }
    if (target.dataset.servicePrice) {
      event.preventDefault(); event.stopImmediatePropagation();
      const service = state.adminServices.find((row) => row.id === target.dataset.servicePrice);
      const entry = prompt('أدخل السعر بالريال، أو اتركه فارغاً لتحديده بعد مراجعة الطلب:', service.price_sar ?? '');
      if (entry === null) return;
      const price_sar = entry.trim() === '' ? null : Number(entry);
      if (price_sar !== null && (!Number.isFinite(price_sar) || price_sar < 0)) return showToast('أدخل مبلغاً صحيحاً غير سالب.');
      try {
        const { error } = await state.client.from('services').update({ price_sar }).eq('id', service.id);
        if (error) throw error;
        await loadAdmin(); await getServices(); render(); showToast('تم تحديث السعر.');
      } catch (error) { showError(error, 'تعذر تحديث السعر'); }
      return;
    }
    if (target.dataset.action === 'admin-add-service') {
      event.preventDefault(); event.stopImmediatePropagation();
      const name = prompt('اسم الخدمة الجديدة:');
      if (!name?.trim()) return;
      const description = prompt('وصف الخدمة:') || '';
      try {
        const { data: category, error: categoryError } = await state.client.from('service_categories').select('id').eq('slug', 'other').single();
        if (categoryError) throw categoryError;
        const slug = `service-${crypto.randomUUID()}`;
        const { error } = await state.client.from('services').insert({ name: name.trim(), slug, description, category_id: category.id, is_active: true });
        if (error) throw error;
        await loadAdmin(); await getServices(); render(); showToast('تمت إضافة الخدمة.');
      } catch (error) { showError(error, 'تعذرت إضافة الخدمة'); }
      return;
    }
  }, true);
  document.addEventListener('change', async (event) => {
    if (event.target.id === 'chatOrder') {
      state.currentChat = event.target.value;
      await loadMessages();
    } else if (event.target.matches('[data-order-status]')) {
      try {
        const { error } = await state.client.from('orders').update({ status: event.target.value }).eq('id', event.target.dataset.orderStatus);
        if (error) throw error;
        await refreshOrders(); await loadAdmin(); render(); showToast('تم تحديث حالة الطلب.');
      } catch (error) { showError(error, 'تعذر تحديث حالة الطلب'); }
    } else if (event.target.matches('#categorySelect')) {
      selectedCategory = event.target.value;
      render();
    }
  }, true);
  document.addEventListener('click', async (event) => {
    const link = event.target.closest('[data-message-file]');
    const orderFile = event.target.closest('[data-order-file]');
    if (!link && !orderFile) return;
    event.preventDefault();
    try {
      const path = link?.dataset.messageFile || orderFile?.dataset.orderFile;
      const { data, error } = await state.client.storage.from('order-files').createSignedUrl(path, 60);
      if (error) throw error;
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error) { showError(error, 'تعذر فتح الملف'); }
  });
  const loadMessages = async () => {
    const host = document.getElementById('chatMessages');
    if (!host || !state.currentChat) { if (host) host.innerHTML = '<p class="empty-state">اختر طلباً لبدء المحادثة.</p>'; return; }
    const { data, error } = await state.client.from('order_messages')
      .select('id,order_id,sender_id,body,attachment_path,attachment_name,created_at')
      .eq('order_id', state.currentChat).order('created_at');
    if (error) { showError(error, 'تعذر تحميل المحادثة'); return; }
    state.messages = data;
    drawMessages();
  };
  const drawMessages = () => {
    const host = document.getElementById('chatMessages');
    if (!host) return;
    host.innerHTML = state.messages.map((message) => `<article class="chat-message ${message.sender_id === state.user.id ? 'mine' : ''}"><p>${html(message.body)}</p>${message.attachment_path ? `<button class="text-link" data-message-file="${html(message.attachment_path)}">${html(message.attachment_name || 'فتح المرفق')}</button>` : ''}<time>${html(new Date(message.created_at).toLocaleString('ar-SA'))}</time></article>`).join('') || '<p class="empty-state">لا توجد رسائل بعد.</p>';
    host.scrollTop = host.scrollHeight;
  };
  const loadOrderFiles = async (orderId) => {
    const host = document.getElementById('orderFiles');
    if (!host) return;
    const { data, error } = await state.client.from('order_files')
      .select('id,file_name,storage_path,created_at').eq('order_id', orderId).order('created_at');
    if (error) { host.textContent = 'تعذر تحميل المرفقات.'; showError(error, 'تعذر تحميل المرفقات'); return; }
    host.innerHTML = data.map((file) => `<p><button type="button" class="text-link" data-order-file="${html(file.storage_path)}">${html(file.file_name)}</button></p>`).join('') || '<p class="empty-state">لا توجد مرفقات.</p>';
  };
  const loadSession = async () => {
    if (!initClient()) return;
    try {
      const { data: { session }, error } = await state.client.auth.getSession();
      if (error) throw error;
      if (session) {
        await prepareUser(session.user);
      } else {
        await getServices();
        showAuth('login');
      }
      state.client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' && !session) {
          state.user = null; state.profile = null; state.orders = [];
          showAuth('login');
        }
        if (event === 'PASSWORD_RECOVERY') {
          authRoot.hidden = false; appShell.hidden = true;
          authRoot.innerHTML = `<section class="auth-frame"><aside class="auth-aside"><div class="auth-brand"><span class="brand-mark">ع</span><span>اعتمد</span></div></aside><section class="auth-content"><h2>تعيين كلمة مرور جديدة</h2><form id="passwordResetForm" class="auth-form"><div class="field"><label for="newPassword">كلمة المرور الجديدة</label><input id="newPassword" type="password" minlength="8" required autocomplete="new-password"></div><button class="primary" type="submit">حفظ كلمة المرور</button></form></section></section>`;
        }
      });
    } catch (error) {
      renderSetup(`فشل الاتصال بـ Supabase. تحقق من رابط المشروع ومفتاح anon/public، ثم تأكد من تشغيل supabase/schema.sql. التفاصيل: ${error.message}`);
    }
  };
  const refreshAvailableForProviders = async () => {
    if (!state.user || currentRole() !== 'provider' || document.visibilityState === 'hidden') return;
    try {
      const before = state.orders.map((order) => `${order.uuid}:${order.provider_id}:${order.statusCode}`).join('|');
      await refreshOrders();
      const after = state.orders.map((order) => `${order.uuid}:${order.provider_id}:${order.statusCode}`).join('|');
      if (before !== after) render();
    } catch (error) { showError(error, 'تعذر تحديث قائمة الطلبات'); }
  };
  window.addEventListener('focus', refreshAvailableForProviders);
  window.setInterval(refreshAvailableForProviders, 12000);
  loadSession();
})();
