<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform">

  <xsl:output method="html" encoding="UTF-8" indent="yes"/>
  <xsl:param name="lang" select="'zh'"/>

  <!-- translate helper -->
  <xsl:template name="tr">
    <xsl:param name="id"/>
    <xsl:value-of select="/data/i18n/t[@id=$id]/l[@lang=$lang]"/>
  </xsl:template>

  <xsl:template match="/data">
    <div class="card">
      <div class="header">
        <div class="header-top">
          <h1 class="title">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M10.5 3.5h3v7h7v3h-7v7h-3v-7h-7v-3h7v-7z" fill="white" opacity="0.95"/>
            </svg>
            <span id="ui-title">
              <xsl:call-template name="tr"><xsl:with-param name="id" select="'title'"/></xsl:call-template>
            </span>
          </h1>

          <div class="chip" title="Medical ID">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 7.5a3.5 3.5 0 0 1 3.5-3.5h5A3.5 3.5 0 0 1 18 7.5v9A3.5 3.5 0 0 1 14.5 20h-5A3.5 3.5 0 0 1 6 16.5v-9z" stroke="white" stroke-width="1.6" opacity="0.95"/>
              <path d="M9 9h6M9 12h6M9 15h4" stroke="white" stroke-width="1.6" stroke-linecap="round" opacity="0.95"/>
            </svg>
            MEDICAL ID
          </div>
        </div>
      </div>

      <div class="photo-sec">
        <div class="profile">
          <img class="profile-img">
            <xsl:attribute name="src"><xsl:value-of select="person/photo"/></xsl:attribute>
            <xsl:attribute name="alt">Profile</xsl:attribute>
            <xsl:attribute name="onerror">
              this.src='https://via.placeholder.com/114x142?text=<xsl:call-template name="tr"><xsl:with-param name="id" select="'photoFallback'"/></xsl:call-template>';
            </xsl:attribute>
          </img>

          <div class="name-block">
            <h2 class="user-name"><xsl:value-of select="person/name"/></h2>
            <div class="subline">
              <span class="pill">
                <span class="pill-label">
                  <xsl:call-template name="tr"><xsl:with-param name="id" select="'pillBlood'"/></xsl:call-template>
                </span>
                : <strong><xsl:value-of select="person/blood"/></strong>
              </span>
              <span class="pill">
                <xsl:value-of select="person/height"/>
                <xsl:text> / </xsl:text>
                <xsl:value-of select="person/weight"/>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="content">

        <!-- BASIC -->
        <div class="section-title"><span class="bar"></span>
          <xsl:call-template name="tr"><xsl:with-param name="id" select="'basic'"/></xsl:call-template>
        </div>
        <div class="grid">
          <div class="item">
            <div class="icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M7 3h10v2H7V3zm2 6h6M8 7h8a2 2 0 0 1 2 2v10a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V9a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="meta">
              <span class="label"><xsl:call-template name="tr"><xsl:with-param name="id" select="'dob'"/></xsl:call-template></span>
              <span class="value mono"><xsl:value-of select="person/dob"/></span>
            </div>
          </div>

          <div class="item">
            <div class="icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M6 7.5A3.5 3.5 0 0 1 9.5 4h5A3.5 3.5 0 0 1 18 7.5v9A3.5 3.5 0 0 1 14.5 20h-5A3.5 3.5 0 0 1 6 16.5v-9z" stroke="currentColor" stroke-width="1.8"/>
                <path d="M9 9h6M9 12h6M9 15h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="meta">
              <span class="label"><xsl:call-template name="tr"><xsl:with-param name="id" select="'passport'"/></xsl:call-template></span>
              <span class="value mono"><xsl:value-of select="person/passport"/></span>
            </div>
          </div>

          <div class="item">
            <div class="icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 3c4.2 3.7 6.6 7.1 6.6 10.2A6.6 6.6 0 0 1 12 19.8a6.6 6.6 0 0 1-6.6-6.6C5.4 10.1 7.8 6.7 12 3z" stroke="currentColor" stroke-width="1.8"/>
              </svg>
            </div>
            <div class="meta">
              <span class="label"><xsl:call-template name="tr"><xsl:with-param name="id" select="'blood'"/></xsl:call-template></span>
              <span class="value" style="color: var(--accent);"><xsl:value-of select="person/blood"/></span>
            </div>
          </div>

          <div class="item">
            <div class="icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 4v16M8 8h8M8 16h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="meta">
              <span class="label"><xsl:call-template name="tr"><xsl:with-param name="id" select="'height'"/></xsl:call-template></span>
              <span class="value mono"><xsl:value-of select="person/height"/></span>
            </div>
          </div>

          <div class="item">
            <div class="icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M8 7c0-2 2-3 4-3s4 1 4 3-2 3-4 3-4-1-4-3zm-2 13c.5-4 4-6 6-6s5.5 2 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="meta">
              <span class="label"><xsl:call-template name="tr"><xsl:with-param name="id" select="'weight'"/></xsl:call-template></span>
              <span class="value mono"><xsl:value-of select="person/weight"/></span>
            </div>
          </div>
        </div>

        <!-- MEDICAL -->
        <div class="section-title" style="margin-top:16px;"><span class="bar"></span>
          <xsl:call-template name="tr"><xsl:with-param name="id" select="'medical'"/></xsl:call-template>
        </div>

        <div class="alert">
          <div class="aicon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 3l10 18H2L12 3z" fill="currentColor" opacity="0.12"/>
              <path d="M12 8v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <path d="M12 17h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
            </svg>
          </div>
          <div>
            <p class="atitle">
              <xsl:call-template name="tr"><xsl:with-param name="id" select="'allergyAlertTitle'"/></xsl:call-template>
            </p>
            <div class="adesc"><xsl:value-of select="person/allergy"/></div>
          </div>
        </div>

        <div class="grid" style="margin-top:10px;">
          <xsl:call-template name="medItem">
            <xsl:with-param name="labelId" select="'allergy'"/>
            <xsl:with-param name="value" select="person/allergy"/>
          </xsl:call-template>

          <xsl:call-template name="medItem">
            <xsl:with-param name="labelId" select="'history'"/>
            <xsl:with-param name="value" select="person/history"/>
          </xsl:call-template>

          <xsl:call-template name="medItem">
            <xsl:with-param name="labelId" select="'family'"/>
            <xsl:with-param name="value" select="person/family"/>
          </xsl:call-template>

          <xsl:call-template name="medItem">
            <xsl:with-param name="labelId" select="'meds'"/>
            <xsl:with-param name="value" select="person/meds"/>
          </xsl:call-template>

          <xsl:call-template name="medItem">
            <xsl:with-param name="labelId" select="'surgery'"/>
            <xsl:with-param name="value" select="person/surgery"/>
          </xsl:call-template>
        </div>

        <!-- CONTACT -->
        <div class="section-title" style="margin-top:16px;"><span class="bar"></span>
          <xsl:call-template name="tr"><xsl:with-param name="id" select="'contact'"/></xsl:call-template>
        </div>
        <div class="grid">
          <div class="item">
            <div class="icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M7 4h10v3H7V4z" stroke="currentColor" stroke-width="1.8"/>
                <path d="M8 7v13h8V7" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                <path d="M10 12h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="meta">
              <span class="label"><xsl:call-template name="tr"><xsl:with-param name="id" select="'ice'"/></xsl:call-template></span>
              <span class="value mono">
                <xsl:call-template name="tr"><xsl:with-param name="id" select="'dad'"/></xsl:call-template>
                <xsl:text>: </xsl:text><xsl:value-of select="person/ice/dad"/>
                <br/>
                <xsl:call-template name="tr"><xsl:with-param name="id" select="'mom'"/></xsl:call-template>
                <xsl:text>: </xsl:text><xsl:value-of select="person/ice/mom"/>
              </span>
            </div>
          </div>
        </div>

      </div>

      <div class="footer">
        <xsl:choose>
          <xsl:when test="$lang='en'"><xsl:value-of select="person/lastUpdatedEn"/></xsl:when>
          <xsl:otherwise><xsl:value-of select="person/lastUpdatedZh"/></xsl:otherwise>
        </xsl:choose>
      </div>
    </div>
  </xsl:template>

  <!-- Reusable medical item row -->
  <xsl:template name="medItem">
    <xsl:param name="labelId"/>
    <xsl:param name="value"/>
    <div class="item">
      <div class="icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M4 12h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M12 4v16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity="0.22"/>
        </svg>
      </div>
      <div class="meta">
        <span class="label">
          <xsl:call-template name="tr"><xsl:with-param name="id" select="$labelId"/></xsl:call-template>
        </span>
        <span class="value"><xsl:value-of select="$value"/></span>
      </div>
    </div>
  </xsl:template>

</xsl:stylesheet>
