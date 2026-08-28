"""Catalogue domain.

Carries over the decisions already settled on the storefront side:
money is stored in paise as integers, and a product's fulfilment path and
pricing unit are modelled per product rather than assumed, because Quoin
sells instantly-deliverable goods, scheduled bulk items, bookable services
and made-to-order materials through one catalogue.

Provenance is deliberately quarantined. Fields prefixed `source_` record
where an imported row came from and what the competitor charged. They are
reference data for pricing decisions — never rendered to customers, never
treated as Quoin's own stock or imagery.
"""

from django.db import models
from django.utils.text import slugify


def unique_slug(model, base, max_length, instance_pk=None):
    """A slug free of collisions within `model`.

    Distinct names routinely collapse onto one slug — "Dr Fixit" and
    "Dr. Fixit" are different brands that both slugify to "dr-fixit" — so
    a numeric suffix is appended until the value is free.
    """
    base = (slugify(base) or "item")[:max_length]
    candidate, n = base, 1
    qs = model.objects.all()
    if instance_pk:
        qs = qs.exclude(pk=instance_pk)
    while qs.filter(slug=candidate).exists():
        n += 1
        suffix = f"-{n}"
        candidate = f"{base[:max_length - len(suffix)]}{suffix}"
    return candidate


class TimeStamped(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Brand(TimeStamped):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug(Brand, self.name, 140, self.pk)
        super().save(*args, **kwargs)


class Category(TimeStamped):
    name = models.CharField(max_length=140)
    slug = models.SlugField(max_length=160, unique=True)
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="children"
    )
    #: Manual sort order on the storefront; ties break by name.
    position = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["position", "name"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug(Category, self.name, 160, self.pk)
        super().save(*args, **kwargs)


class Fulfilment(models.TextChoices):
    """How a listing reaches the customer. Drives cart splitting."""

    INSTANT = "instant", "Instant — dark store, 18 minutes"
    SCHEDULED = "scheduled", "Scheduled — stocked, delivered on a chosen date"
    BOOKABLE = "bookable", "Bookable — consumes a professional's time slot"
    MADE_TO_ORDER = "made_to_order", "Made to order — cut or built after ordering"


class PricingUnit(models.TextChoices):
    PIECE = "per_piece", "Per piece"
    SQFT = "per_sqft", "Per sq.ft."
    RUNNING_FT = "per_running_ft", "Per running ft."
    VISIT = "per_visit", "Per visit"
    BAG = "per_bag", "Per bag"
    LITRE = "per_litre", "Per litre"
    KG = "per_kg", "Per kg"


class GstRate(models.IntegerChoices):
    """GST slabs. Cement is 28%, most building materials 18%."""

    NIL = 0, "0%"
    FIVE = 5, "5%"
    TWELVE = 12, "12%"
    EIGHTEEN = 18, "18%"
    TWENTY_EIGHT = 28, "28%"


class Product(TimeStamped):
    sku = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=280, unique=True)

    brand = models.ForeignKey(
        Brand, null=True, blank=True, on_delete=models.PROTECT, related_name="products"
    )
    category = models.ForeignKey(
        Category, null=True, blank=True, on_delete=models.PROTECT, related_name="products"
    )

    description = models.TextField(blank=True)

    fulfilment = models.CharField(
        max_length=20, choices=Fulfilment.choices, default=Fulfilment.SCHEDULED
    )
    pricing_unit = models.CharField(
        max_length=20, choices=PricingUnit.choices, default=PricingUnit.PIECE
    )
    gst_rate = models.PositiveSmallIntegerField(
        choices=GstRate.choices, default=GstRate.EIGHTEEN
    )

    #: Quoin's own photography. Empty until it exists — the storefront
    #: falls back to a generated swatch rather than borrowing an image.
    image = models.URLField(max_length=500, blank=True)

    is_active = models.BooleanField(default=True)

    # ---- provenance: reference only, never customer-facing -------------
    source_name = models.CharField(max_length=60, blank=True)
    source_url = models.URLField(max_length=500, blank=True)
    source_image_url = models.URLField(max_length=500, blank=True)
    source_availability = models.CharField(max_length=20, blank=True)
    source_price_paise = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["category", "is_active"]),
            models.Index(fields=["brand"]),
        ]

    def __str__(self):
        return f"{self.brand.name + ' ' if self.brand_id else ''}{self.name}"

    def save(self, *args, **kwargs):
        if not self.slug:
            base = f"{self.brand.name if self.brand_id else ''} {self.name} {self.sku}"
            self.slug = unique_slug(Product, base, 280, self.pk)
        super().save(*args, **kwargs)

    @property
    def default_variant(self):
        return self.variants.filter(is_default=True).first() or self.variants.first()


class ProductVariant(TimeStamped):
    """A purchasable option. Every product has at least one.

    Products with more than one variant display the cheapest as
    "₹X Onwards" rather than an exact price.
    """

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants")
    label = models.CharField(max_length=140, default="Standard")
    sku = models.CharField(max_length=64, unique=True)

    mrp_paise = models.PositiveIntegerField(help_text="List price before discount, in paise")
    price_paise = models.PositiveIntegerField(help_text="Sell price for a standard customer")
    pro_price_paise = models.PositiveIntegerField(
        null=True, blank=True, help_text="Quoin Pro trade rate; blank means Pro pays the same"
    )

    #: Marble is not sold by the single square foot, nor cement by the bag.
    min_qty = models.PositiveIntegerField(default=1)
    step_qty = models.PositiveIntegerField(default=1)

    is_default = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["price_paise"]

    def __str__(self):
        return f"{self.product.name} — {self.label}"


class PriceTier(models.Model):
    """Volume break. Contractors buy cement by the hundred bags."""

    variant = models.ForeignKey(
        ProductVariant, on_delete=models.CASCADE, related_name="price_tiers"
    )
    min_qty = models.PositiveIntegerField()
    max_qty = models.PositiveIntegerField(null=True, blank=True, help_text="Blank means no upper bound")
    price_paise = models.PositiveIntegerField()

    class Meta:
        ordering = ["min_qty"]
        constraints = [
            models.UniqueConstraint(fields=["variant", "min_qty"], name="uniq_tier_per_variant_min"),
        ]

    def __str__(self):
        upper = self.max_qty or "+"
        return f"{self.min_qty}-{upper}: {self.price_paise / 100:.2f}"
