export function Offline() {
  return (
    <div className="page">
      <header>
        <h1>الاستخدام دون اتصال</h1>
        <p>الوظائف الأساسية تعمل دون اتصال بعد تنزيل المحتوى</p>
      </header>
      <section className="grid">
        <article className="card">
          <h2>متوفر دون اتصال</h2>
          <ul>
            <li>اختيار المحصول والتنقل</li>
            <li>التشخيص بالأسئلة الموجهة</li>
            <li>عرض التوصيات المحملة</li>
            <li>حفظ الحالات محلياً</li>
          </ul>
        </article>
        <article className="card">
          <h2>يتطلب اتصال</h2>
          <ul>
            <li>إرسال طلب إحالة للخبير</li>
            <li>لوحات المؤسسات والإحصائيات الحية</li>
            <li>تحديثات المحتوى</li>
            <li>ميزات الذكاء الاصطناعي مستقبلية</li>
          </ul>
        </article>
      </section>
      <section className="notice">
        <strong>ملاحظة</strong>
        <span>حفظ الحالات المحلية محفوظ حتى بعد فشل المزامنة. يتم التعامل مع التعارضات بأمان دون حذف تلقائي.</span>
      </section>
    </div>
  );
}
