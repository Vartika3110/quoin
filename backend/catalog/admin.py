"""Merchandising console.

This is the practical reason the catalogue lives in Django: an ops team
needs to edit 700+ products, prices and stock without a developer, and
this is that surface for free.
"""
from django.contrib import admin
from django.utils.html import format_html

from .models import Brand, Category, PriceTier, Product, ProductVariant


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ("name", "product_count", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name",)
    prepopulated_fields = {"slug": ("name",)}

    @admin.display(description="products")
    def product_count(self, obj):
        return obj.products.count()


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "parent", "product_count", "position", "is_active")
    list_filter = ("is_active", "parent")
    search_fields = ("name",)
    list_editable = ("position", "is_active")
    prepopulated_fields = {"slug": ("name",)}

    @admin.display(description="products")
    def product_count(self, obj):
        return obj.products.count()


class PriceTierInline(admin.TabularInline):
    model = PriceTier
    extra = 0


class ProductVariantInline(admin.StackedInline):
    model = ProductVariant
    extra = 0
    fields = (
        ("label", "sku", "is_default", "is_active"),
        ("mrp_paise", "price_paise", "pro_price_paise"),
        ("min_qty", "step_qty"),
    )


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "brand", "category", "price_display", "fulfilment", "gst_rate", "needs_work", "is_active")
    list_filter = ("is_active", "fulfilment", "pricing_unit", "gst_rate", "category", "brand", "source_name")
    search_fields = ("name", "sku", "brand__name", "category__name")
    list_select_related = ("brand", "category")
    autocomplete_fields = ("brand", "category")
    inlines = [ProductVariantInline]
    list_per_page = 50
    actions = ["activate", "deactivate"]
    fieldsets = (
        (None, {"fields": ("sku", "name", "slug", "brand", "category", "description", "is_active")}),
        ("Commercial", {"fields": ("fulfilment", "pricing_unit", "gst_rate", "image")}),
        ("Provenance — reference only, never shown to customers", {
            "classes": ("collapse",),
            "fields": ("source_name", "source_url", "source_image_url",
                       "source_availability", "source_price_paise"),
        }),
    )

    @admin.display(description="price", ordering="variants__price_paise")
    def price_display(self, obj):
        v = obj.default_variant
        return f"₹{v.price_paise / 100:,.0f}" if v else "—"

    @admin.display(description="to fix")
    def needs_work(self, obj):
        gaps = []
        if not obj.category_id:
            gaps.append("category")
        if not obj.image:
            gaps.append("image")
        if not gaps:
            return format_html('<span style="color:#2f7d4f">ok</span>')
        return format_html('<span style="color:#a65423">{}</span>', ", ".join(gaps))

    @admin.action(description="Activate selected products")
    def activate(self, request, queryset):
        self.message_user(request, f"{queryset.update(is_active=True)} activated.")

    @admin.action(description="Deactivate selected products")
    def deactivate(self, request, queryset):
        self.message_user(request, f"{queryset.update(is_active=False)} deactivated.")


@admin.register(ProductVariant)
class ProductVariantAdmin(admin.ModelAdmin):
    list_display = ("product", "label", "sku", "price_paise", "pro_price_paise", "is_active")
    search_fields = ("sku", "product__name")
    list_select_related = ("product",)
    inlines = [PriceTierInline]


admin.site.site_header = "Quoin catalogue"
admin.site.site_title = "Quoin"
admin.site.index_title = "Merchandising"
